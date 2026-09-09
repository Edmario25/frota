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
# Porta em que o Pi escuta as notificacoes do leitor UHF (Control iD iDUHF).
# O mesmo valor vai no campo "Porta" do modo monitor, na tela do leitor.
# Vazio ou 0 desativa o leitor: so a velocidade e registrada.
LEITOR_PORTA = int(os.getenv("LEITOR_PORTA", "0") or 0)

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
# Teto de duracao de uma passagem. Sem isso, ruido continuo mantem a
# passagem sempre "aberta" (nunca ha silencio) e NADA e enviado -- o
# script fica mudo para sempre. Um veiculo cruza o ponto em poucos
# segundos; passou disso, fecha e envia o que tem.
DUR_MAX  = float(os.getenv("DURACAO_MAX_S", "8.0"))
# DEBUG=1 no .env imprime cada leitura crua do radar. Essencial para
# diagnosticar em campo por que uma passagem nao foi registrada.
DEBUG    = os.getenv("DEBUG", "0") not in ("0", "", "false", "False")

# Contadores para o heartbeat (sem eles o script fica mudo e nao da
# para saber se esta vivo, se o radar emite, ou se o filtro descarta)
stats = {"linhas": 0, "leituras": 0, "descartadas": 0, "passagens": 0,
         "tags": 0, "leitor_visto_em": 0.0}

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
            comandos = [b"Od\n", b"OS\n", b"OM\n", b"UK\n"]

            # "M>" define SpeedMagnitudeMin: a forca minima do eco, NAO a
            # velocidade minima que o nome sugere. Alimentado com MAG_MIN,
            # faz o radar descartar o ruido de fundo na origem -- em vez de
            # transmitir milhares de linhas inuteis para o Pi jogar fora.
            # A filtragem no codigo continua como segunda barreira.
            if MAG_MIN > 0:
                comandos.append(f"M>{MAG_MIN:.0f}\n".encode())

            for cmd in comandos:
                r.write(cmd); time.sleep(0.3)
            log("Radar conectado em", PORTA,
                f"(magnitude minima no radar: {MAG_MIN:.0f})" if MAG_MIN > 0
                else "(sem filtro de magnitude)")

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
    Recebe as leituras do Control iD iDUHF pelo modo Monitor.

    O leitor faz POST para <IP do Pi>:<LEITOR_PORTA>/api/notifications/...
    a cada evento. Configuracao no proprio leitor, em
    Configuracoes -> Modo de Operacao -> Configurar modo monitor.

    Formato observado no equipamento (firmware V5.19.2):

        POST /api/notifications/dao
        {"object_changes": [{"object": "access_logs", "type": "inserted",
          "values": {"card_value": "223338326031", "user_id": "", ...}}]}

        POST /api/notifications/device_is_alive
        {"access_logs": 3, "device_id": ..., "time": ...}

    A tag vem em card_value. Deixamos o leitor SEM as tags cadastradas de
    proposito: quem resolve tag -> veiculo e o nosso banco, na tabela
    sms_veiculos_rfid. Assim o cadastro nao fica duplicado em dois lugares.

    Usamos o modo Monitor e nao o modo Online porque o Monitor e
    assincrono: se o Pi cair, o leitor continua operando normalmente.
    No modo Online ele ficaria esperando resposta a cada leitura.
    """
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class Receptor(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_POST(self):
            tamanho = int(self.headers.get("Content-Length") or 0)
            bruto = self.rfile.read(tamanho) if tamanho else b""
            self._responder()          # responde antes de processar
            try:
                dados = json.loads(bruto.decode("utf-8", "replace"))
            except Exception:
                return

            if self.path.endswith("/device_is_alive"):
                stats["leitor_visto_em"] = time.time()
                return

            agora = time.time()
            for mudanca in dados.get("object_changes", []):
                if mudanca.get("object") != "access_logs":
                    continue
                if mudanca.get("type") != "inserted":
                    continue
                v = mudanca.get("values", {}) or {}
                tag = (v.get("card_value") or v.get("uhf_tag") or "").strip()
                if not tag or tag in ("0", ""):
                    continue
                fila_tag.put((agora, tag.upper()))
                stats["tags"] += 1
                if DEBUG:
                    log(f"  tag: {tag}")

        def _responder(self):
            # event 6 = negado. Nao ha portao para abrir aqui; so registramos.
            corpo = json.dumps({"result": {"event": 6, "user_id": 0,
                                           "user_name": "", "portal_id": 1,
                                           "actions": []}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)

        def do_GET(self):
            self._responder()

        def log_message(self, *a):
            pass               # o log e nosso, nao o do http.server

    while not parar.is_set():
        try:
            srv = ThreadingHTTPServer(("0.0.0.0", LEITOR_PORTA), Receptor)
            srv.timeout = 1
            log(f"Aguardando o leitor UHF na porta {LEITOR_PORTA}")
            while not parar.is_set():
                srv.handle_request()
            srv.server_close()
        except Exception as e:
            log("Servidor do leitor caiu:", e, "- retentando em 5s")
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

        # Fecha a passagem quando o radar silencia OU quando ela ja dura
        # tempo demais. A segunda condicao e a rede de seguranca: sem ela,
        # ruido continuo impede o silencio e nada e enviado nunca.
        if inicio is not None:
            silenciou = (agora - ultima) > FIM_PASS
            estourou  = (agora - inicio) > DUR_MAX
            if silenciou or estourou:
                candidatas = [(abs(t - inicio), e) for (t, e) in tags
                              if abs(t - inicio) <= JANELA]
                epc = min(candidatas)[1] if candidatas else None
                if estourou and not silenciou:
                    log(f"[aviso] passagem fechada por tempo ({DUR_MAX:.0f}s) - "
                        "sinal continuo. Suspeita de ruido: use MAGNITUDE_MIN")
                stats["passagens"] += 1
                enviar(pico, epc, inicio)
                if epc:
                    tags = [(t, e) for (t, e) in tags if e != epc]
                pico, inicio, ultima = 0.0, None, agora

        # Tenta reenviar o que ficou preso a cada 60s
        if agora - ultimo_reenvio > 60:
            reenviar_pendentes()
            # Heartbeat: prova que o script esta vivo e mostra onde os
            # dados estao parando (radar mudo? filtro comendo tudo?)
            log(f"[status] {stats['linhas']} linhas do radar, "
                f"{stats['leituras']} leituras validas, "
                f"{stats['descartadas']} descartadas pelo filtro, "
                f"{stats['passagens']} passagens enviadas, "
                f"{stats['tags']} tags lidas")
            if stats["linhas"] == 0:
                log("[status] radar nao emitiu nada - confira a config e o cabo")
            if LEITOR_PORTA:
                visto = stats["leitor_visto_em"]
                if not visto:
                    log("[status] leitor UHF nunca chamou - confira o modo "
                        "monitor na tela dele (hostname, porta e endpoint)")
                elif agora - visto > 120:
                    log(f"[status] leitor UHF sem contato ha "
                        f"{int(agora - visto)}s")
            ultimo_reenvio = agora

        time.sleep(0.05)


# --- Inicio ----------------------------------------------------------
if __name__ == "__main__":
    log("Checkpoint iniciando...")
    threading.Thread(target=ler_radar, daemon=True).start()
    if LEITOR_PORTA:
        threading.Thread(target=ler_tags, daemon=True).start()
    else:
        log("AVISO: leitor UHF não configurado - só velocidade sera enviada")
    try:
        correlacionar()
    except KeyboardInterrupt:
        parar.set()
        log("Encerrado.")
