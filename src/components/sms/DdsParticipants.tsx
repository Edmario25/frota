import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { identifyDdsBadge } from '@/lib/dds';

export type DdsParticipant = { id: string; origem: 'manual' | 'qr' };
export type DdsEmployee = { id: string; nome: string };

export function DdsParticipants({ equipe, value, onChange, disabled = false }: {
  equipe: DdsEmployee[]; value: DdsParticipant[]; onChange: (value: DdsParticipant[]) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const elementId = useId().replace(/:/g, '') + '-dds-reader';
  const latest = useRef({ equipe, value, onChange });
  latest.current = { equipe, value, onChange };
  useEffect(() => {
    if (!scanning || disabled) return;
    let disposed = false;
    let stop: (() => Promise<void>) | undefined;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (disposed) return;
        const scanner = new Html5Qrcode(elementId);
        await scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: 220 }, raw => {
          if (disposed) return;
          const employee = identifyDdsBadge(raw, latest.current.equipe);
          if (!employee) { setMessage('Crachá não encontrado na equipe desta obra.'); return; }
          if (latest.current.value.some(p => p.id === employee.id)) { setMessage(`${employee.nome} já está na lista.`); return; }
          const next = [...latest.current.value, { id: employee.id, origem: 'qr' as const }];
          latest.current.value = next;
          latest.current.onChange(next);
          setMessage(`Identificado: ${employee.nome}`);
        }, () => {});
        stop = () => scanner.stop();
        if (disposed) await stop();
      } catch { if (!disposed) setMessage('Não foi possível abrir a câmera. Verifique a permissão ou use a busca manual.'); }
    })();
    return () => { disposed = true; stop?.().catch(() => {}); };
  }, [scanning, disabled, elementId]);
  const filtered = equipe.filter(e => e.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="space-y-3">
    <div className="flex gap-2"><Input aria-label="Buscar participante" placeholder="Buscar funcionário da obra…" value={search} onChange={e => setSearch(e.target.value)} />
      {!disabled && <Button type="button" variant="outline" onClick={() => { setMessage(''); setScanning(v => !v); }}>{scanning ? 'Fechar câmera' : 'Escanear crachá'}</Button>}
    </div>
    {scanning && !disabled && <div id={elementId} className="max-w-sm mx-auto" />}
    {message && <p role="status" className="text-sm text-blue-700">{message}</p>}
    <p className="text-sm font-medium">{value.length} participantes identificados</p>
    <p className="text-xs text-muted-foreground">A leitura do crachá identifica o funcionário. Não equivale a uma assinatura. A presença é registrada pelo responsável.</p>
    <div className="max-h-64 overflow-y-auto divide-y rounded-lg border">
      {!filtered.length && <p className="p-4 text-sm text-muted-foreground">Nenhum funcionário disponível para esta busca.</p>}
      {filtered.map(e => <label key={e.id} className="flex gap-3 items-center p-3"><input type="checkbox" disabled={disabled} checked={value.some(p => p.id === e.id)} onChange={event => onChange(event.target.checked ? [...value, { id: e.id, origem: 'manual' }] : value.filter(p => p.id !== e.id))} /><span className="flex-1 text-sm">{e.nome}</span><small>{value.find(p => p.id === e.id)?.origem === 'qr' ? 'Crachá QR' : ''}</small></label>)}
    </div>
  </div>;
}
