#!/usr/bin/env python3
"""
checkpoint.py - Integração radar OPS243-C + leitor UHF -> Sistema Apice

Arquitetura: duas threads independentes alimentam filas com carimbo de
tempo. O correlacionador junta velocidade + tag da mesma passagem e envia
uma única linha ao servidor. O servidor decide se houve infração.
"""
import json, os, queue, threading, time
from datetime import datetime, timezone
import requests, serial

# --- Configuração (lida do arquivo .env) ---------------------------
def carregar_env(caminho=".env"):
    if os.path.exists(caminho):
        for ln in open(caminho):
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

carregar_env(os.path.join(os.path.dirname(__file__), ".env"))

URL      = os.environ["SUPABASE_URL"]
ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
TOKEN    = os.environ["DEVICE_TOKEN"]
PORTA    = os.getenv("RADAR_PORT", "/dev/ttyACM0")
BAUD     = int(os.getenv("RADAR_BAUD", "19200"))
LEITOR   = os.getenv("LEITOR_IP", "")

# Janela de correlação: tag e velocidade dentro deste intervalo
# são consideradas o mesmo veículo
JANELA   = float(os.getenv("JANELA_S", "2.0"))
# Abaixo disso e ruido (pessoa andando, galho ao vento)
VEL_MIN  = float(os.getenv("VELOCIDADE_MIN", "5.0"))
# Magnitude minima do eco para considerar veiculo. Calibrar no local:
# rodar com a via vazia e ver ate quanto o ruido chega. 0 desativa.
MAG_MIN  = float(os.getenv("MAGNITUDE_MIN", "0"))
# Silêncio que encerra uma passagem
FIM_PASS = 1.2
# DEBUG=1 no .env imprime cada leitura crua do radar. Essencial para
# diagnosticar em campo por que uma passagem nao foi registrada.
DEBUG    = os.getenv("DEBUG", "0") not in ("0", "", "false", "False")

# Contadores para o heartbeat (sem eles o script fica mudo e nao da
# para saber se esta vivo, se o radar emite, ou se o filtro descarta)
stats = {"linhas": 0, "leituras": 0, "descartadas": 0, "passagens": 0}

RPC = f"{URL}/rest/v1/rpc/registrar_passagem_checkpoint"
CABECALHO = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}",
             "Content-Type": "application/json"}

fila_vel = queue.Queue()   # (momento, velocidade)
fila_tag = queue.Queue()   # (momento, epc)
parar = threading.Event()

def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


# --- Thread 1: le o radar -------------------------------------------
def ler_radar():
    while not parar.is_set():
        try:
            r = serial.Serial(PORTA, BAUD, timeout=1)
            time.sleep(0.5)
            # Configuracao validada em bancada no OPS243-C-FC:
            #   Od  desliga o reporte de distancia (senao inunda a porta)
            #   OS  liga o reporte de velocidade
            #   OM  liga a magnitude do sinal (usada para filtrar ruido)
            #   UK  unidade em km/h
            # A configuracao NAO persiste: o radar volta ao padrao a cada
            # reconexao, por isso e reenviada aqui toda vez.
            #
            # ATENCAO: nao enviar "M>" aqui. Apesar do nome sugestivo, ele
            # define SpeedMagnitudeMin (forca do eco), nao velocidade minima.
            # A filtragem por velocidade e feita abaixo, no codigo, e a por
            # magnitude via MAGNITUDE_MIN.
            for cmd in (b"Od\n", b"OS\n", b"OM\n", b"UK\n"):
                r.write(cmd); time.sleep(0.3)
            log("Radar conectado em", PORTA)

            while not parar.is_set():
                linha = r.readline().decode(errors="ignore").strip()
                if not linha:
                    continue
                stats["linhas"] += 1
                if DEBUG:
                    log("  radar:", linha)

                v, mag = extrair_leitura(linha)
                if v is None:
                    continue
                stats["leituras"] += 1

                if abs(v) < VEL_MIN:
                    stats["descartadas"] += 1
                    if DEBUG:
                        log(f"    descartada: {abs(v):.1f} < VELOCIDADE_MIN={VEL_MIN}")
                    continue
                # Descarta eco fraco demais para ser veiculo (ruido/fantasma)
                if MAG_MIN > 0 and mag is not None and mag < MAG_MIN:
                    stats["descartadas"] += 1
                    if DEBUG:
                        log(f"    descartada: magnitude {mag} < MAGNITUDE_MIN={MAG_MIN}")
                    continue
                fila_vel.put((time.time(), abs(v)))
        except Exception as e:
            log("Radar caiu:", e, "- retentando em 5s")
            time.sleep(5)


def extrair_leitura(linha):
    """
    Formatos do OPS243-C (confirmados em bancada):

        "kmph",2.6              sem magnitude   (OM desligado)
        "kmph",171,2.6          com magnitude   (OM ligado)
        "m",2.0                 distancia            -> ignorada
        {"SpeedUnit":"kmph"}    resposta de comando  -> ignorada

    Com OM ligado a velocidade e sempre o ULTIMO campo, e a magnitude
    vem antes dela. A magnitude e o que separa alvo real de fantasma.

    Retorna (velocidade_kmh, magnitude). Magnitude e None quando o
    radar nao esta reportando. (None, None) quando nao e velocidade.
    """
    linha = linha.strip()
    if not linha or linha[0] != '"':
        return None, None                 # resposta de comando ou lixo

    partes = linha.split(",")
    unidade = partes[0].strip('"').lower()
    if unidade not in ("kmph", "kmh", "mps"):
        return None, None                 # "m" = distancia

    try:
        if len(partes) >= 3:
            mag, vel = float(partes[1]), float(partes[2])
        elif len(partes) == 2:
            mag, vel = None, float(partes[1])
        else:
            return None, None
    except ValueError:
        return None, None

    if unidade == "mps":
        vel *= 3.6                        # m/s -> km/h
    return vel, mag


# --- Thread 2: le as tags UHF ---------------------------------------
def ler_tags():
    """
    ADAPTE ESTA FUNCAO AO SEU LEITOR.
    A unica obrigacao e chamar fila_tag.put((time.time(), EPC)).
    Abaixo, o caminho do Impinj R420 via LLRP.
    """
    from sllurp.llrp import LLRPReaderClient, LLRPReaderConfig

    def ao_ler(reader, tags):
        agora = time.time()
        for t in tags:
            epc = t.get("EPC")
            if isinstance(epc, bytes):
                epc = epc.decode(errors="ignore")
            if epc:
                fila_tag.put((agora, epc.upper()))

    while not parar.is_set():
        try:
            cfg = LLRPReaderConfig({"report_every_n_tags": 1, "antennas": [1],
                                    "tx_power": 0, "start_inventory": True})
            leitor = LLRPReaderClient(LEITOR, 5084, cfg)
            leitor.add_tag_report_callback(ao_ler)
            leitor.connect()
            log("Leitor UHF conectado em", LEITOR)
            while not parar.is_set():
                time.sleep(1)
            leitor.disconnect()
        except Exception as e:
            log("Leitor caiu:", e, "- retentando em 5s")
            time.sleep(5)


# --- Envio ao sistema -----------------------------------------------
def enviar(velocidade, epc, momento):
    corpo = {
        "p_device_token":   TOKEN,
        "p_tag_epc":        epc or "",
        "p_velocidade_kmh": round(velocidade, 1),
        "p_sentido":        "indefinido",
        "p_foto_url":       None,
        "p_detectado_em":   datetime.fromtimestamp(
                                momento, tz=timezone.utc).isoformat(),
    }
    try:
        resp = requests.post(RPC, headers=CABECALHO, json=corpo, timeout=10)
        resp.raise_for_status()
        r = resp.json()
        if r.get("infração"):
            log(f"INFRACAO  {velocidade:.0f} km/h  tag={epc}  "
                f"gravidade={r.get('gravidade')}")
        else:
            log(f"passagem  {velocidade:.0f} km/h  tag={epc or '-'}")
    except Exception as e:
        log("Falha ao enviar:", e)
        gravar_pendente(corpo)


def gravar_pendente(corpo):
    """Sem internet: guarda em disco para reenviar depois."""
    with open("pendentes.jsonl", "a") as f:
        f.write(json.dumps(corpo) + "\n")


def reenviar_pendentes():
    if not os.path.exists("pendentes.jsonl"):
        return
    linhas = [l for l in open("pendentes.jsonl") if l.strip()]
    if not linhas:
        return
    log(f"Reenviando {len(linhas)} registro(s) pendente(s)")
    restantes = []
    for ln in linhas:
        try:
            resp = requests.post(RPC, headers=CABECALHO,
                                 json=json.loads(ln), timeout=10)
            resp.raise_for_status()
        except Exception:
            restantes.append(ln)
    with open("pendentes.jsonl", "w") as f:
        f.writelines(restantes)


# --- Correlacionador: junta velocidade + tag ------------------------
def correlacionar():
    pico = 0.0          # maior velocidade da passagem atual
    inicio = None       # quando a passagem comecou
    ultima = 0.0        # ultima leitura do radar
    tags = []           # tags vistas recentemente
    ultimo_reenvio = time.time()

    while not parar.is_set():
        agora = time.time()

        # Coleta tudo que chegou
        while not fila_vel.empty():
            t, v = fila_vel.get()
            if v > pico:
                pico = v
            if inicio is None:
                inicio = t
            ultima = t

        while not fila_tag.empty():
            tags.append(fila_tag.get())

        # Descarta tags velhas demais para pertencer a esta passagem
        tags = [(t, e) for (t, e) in tags if agora - t < JANELA * 3]

        # Passagem encerrada: radar ficou em silêncio
        if inicio is not None and (agora - ultima) > FIM_PASS:
            candidatas = [(abs(t - inicio), e) for (t, e) in tags
                          if abs(t - inicio) <= JANELA]
            epc = min(candidatas)[1] if candidatas else None
            stats["passagens"] += 1
            enviar(pico, epc, inicio)
            if epc:
                tags = [(t, e) for (t, e) in tags if e != epc]
            pico, inicio = 0.0, None

        # Tenta reenviar o que ficou preso a cada 60s
        if agora - ultimo_reenvio > 60:
            reenviar_pendentes()
            # Heartbeat: prova que o script esta vivo e mostra onde os
            # dados estao parando (radar mudo? filtro comendo tudo?)
            log(f"[status] {stats['linhas']} linhas do radar, "
                f"{stats['leituras']} leituras validas, "
                f"{stats['descartadas']} descartadas pelo filtro, "
                f"{stats['passagens']} passagens enviadas")
            if stats["linhas"] == 0:
                log("[status] radar nao emitiu nada - confira a config e o cabo")
            ultimo_reenvio = agora

        time.sleep(0.05)


# --- Inicio ----------------------------------------------------------
if __name__ == "__main__":
    log("Checkpoint iniciando...")
    threading.Thread(target=ler_radar, daemon=True).start()
    if LEITOR:
        threading.Thread(target=ler_tags, daemon=True).start()
    else:
        log("AVISO: leitor UHF não configurado - só velocidade sera enviada")
    try:
        correlacionar()
    except KeyboardInterrupt:
        parar.set()
        log("Encerrado.")
