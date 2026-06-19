'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { API_CONFIG } from '@/lib/config';

// ── 타입 (백엔드 /journal/stats 와 일치) ──
interface Summary {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPct: number;
  avgWinPct: number;
  avgLossPct: number;
  rr: number;
  totalUsd: number;
}
interface JournalStats {
  overall: Summary;
  byAccount: Record<string, Summary>;
  byLeverage: Record<string, Summary>;
  cumulativeUsd: { t: number; cum: number }[];
}
interface JournalTrade {
  id: string;
  account: string;
  symbol: string;
  side: string;
  leverage: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  qty: number;
  closedPnl: number;
  closeTime: number;
}

const base = API_CONFIG.BASE_URL;
const usd = (v: number) => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const col = (v: number) => (v >= 0 ? 'text-green-400' : 'text-red-400');
const ACCOUNT_LABEL: Record<string, string> = { bybit_std: 'STD (저레버리지)', bybit_turbo: 'TURBO (고정 3x)' };

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className='flex justify-between text-xs'>
      <span className='text-zinc-500'>{label}</span>
      <span className={`font-mono ${color ?? 'text-zinc-200'}`}>{value}</span>
    </div>
  );
}

function SummaryCard({ title, s, highlight }: { title: string; s: Summary; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-800/50'}`}>
      <div className='flex items-center justify-between mb-2'>
        <span className='text-sm font-medium text-zinc-200'>{title}</span>
        <span className='text-[10px] text-zinc-500'>{s.count}건</span>
      </div>
      {/* 핵심: % 와 달러를 나란히 — % 좋아도 달러로 진실을 본다 */}
      <div className='grid grid-cols-2 gap-2 mb-2'>
        <div className='text-center'>
          <div className='text-[10px] text-zinc-500 uppercase'>평균 %</div>
          <div className={`text-sm font-mono ${col(s.avgPct)}`}>{pct(s.avgPct)}</div>
        </div>
        <div className='text-center'>
          <div className='text-[10px] text-zinc-500 uppercase'>실현 $</div>
          <div className={`text-sm font-mono font-bold ${col(s.totalUsd)}`}>{usd(s.totalUsd)}</div>
        </div>
      </div>
      <div className='space-y-0.5'>
        <StatRow label='승률' value={`${s.winRate.toFixed(1)}% (${s.wins}/${s.wins + s.losses})`} />
        <StatRow label='손익비' value={s.rr.toFixed(2)} />
        <StatRow label='평균 익절 / 손절' value={`${pct(s.avgWinPct)} / ${pct(s.avgLossPct)}`} />
      </div>
    </div>
  );
}

export default function TradeJournal() {
  const qc = useQueryClient();
  const { data: stats, isLoading } = useQuery<JournalStats>({
    queryKey: ['journal-stats'],
    queryFn: () => fetch(`${base}/journal/stats`).then(r => r.json()),
    refetchInterval: 60_000,
  });
  const { data: trades } = useQuery<JournalTrade[]>({
    queryKey: ['journal-trades'],
    queryFn: () => fetch(`${base}/journal/trades?limit=200`).then(r => r.json()),
    refetchInterval: 60_000,
  });
  const sync = useMutation({
    mutationFn: () => fetch(`${base}/journal/sync`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal-stats'] });
      qc.invalidateQueries({ queryKey: ['journal-trades'] });
    },
  });

  if (isLoading) return <div className='text-zinc-500 text-sm'>로딩 중...</div>;
  if (!stats || stats.overall.count === 0) {
    return (
      <div className='bg-zinc-900 rounded-lg p-6 text-center space-y-3'>
        <p className='text-zinc-400 text-sm'>저널 데이터가 없습니다.</p>
        <p className='text-zinc-600 text-xs'>
          quant-trade <code>.env</code>에 BYBIT_STD / BYBIT_TURBO 읽기 전용 키를 넣고 동기화하세요.
        </p>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className='px-3 py-1.5 text-xs rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 disabled:opacity-40'
        >
          {sync.isPending ? '동기화 중...' : 'Bybit 동기화'}
        </button>
      </div>
    );
  }

  const cum = stats.cumulativeUsd.map(c => ({ ...c, date: new Date(c.t).toLocaleDateString('ko-KR') }));
  const o = stats.overall;

  return (
    <div className='space-y-4'>
      {/* 헤드라인: 전체 — % 와 달러 대비 */}
      <div className='bg-zinc-900 rounded-lg p-4'>
        <div className='flex items-center justify-between mb-3'>
          <h2 className='text-sm font-medium text-zinc-300'>봇 거래 저널 (Bybit closed-PnL · 수동 고레버리지 제외)</h2>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className='px-2.5 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40'
          >
            {sync.isPending ? '동기화 중...' : '↻ 동기화'}
          </button>
        </div>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
          <div className='text-center'>
            <div className='text-[10px] text-zinc-500 uppercase'>승률</div>
            <div className='text-lg font-mono text-zinc-100'>{o.winRate.toFixed(1)}%</div>
          </div>
          <div className='text-center'>
            <div className='text-[10px] text-zinc-500 uppercase'>거래당 평균 %</div>
            <div className={`text-lg font-mono ${col(o.avgPct)}`}>{pct(o.avgPct)}</div>
          </div>
          <div className='text-center'>
            <div className='text-[10px] text-zinc-500 uppercase'>손익비</div>
            <div className='text-lg font-mono text-zinc-100'>{o.rr.toFixed(2)}</div>
          </div>
          <div className='text-center'>
            <div className='text-[10px] text-zinc-500 uppercase'>실현 손익 ($)</div>
            <div className={`text-lg font-mono font-bold ${col(o.totalUsd)}`}>{usd(o.totalUsd)}</div>
          </div>
        </div>
        {o.avgPct > 0 && o.totalUsd < 0 && (
          <p className='mt-2 text-[11px] text-yellow-400/80'>
            ⚠ 평균 %는 양수인데 실현 달러는 마이너스입니다 — 사이징 변동성(큰 포지션에서 손실)이 엣지를 갉아먹는 신호.
          </p>
        )}
      </div>

      {/* 계정별 — turbo(고레버리지) vs std */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {Object.entries(stats.byAccount).map(([acc, s]) => (
          <SummaryCard key={acc} title={ACCOUNT_LABEL[acc] ?? acc} s={s} highlight />
        ))}
      </div>

      {/* 레버리지 구간별 */}
      <div className='bg-zinc-900 rounded-lg p-4'>
        <h3 className='text-xs font-medium text-zinc-400 mb-2'>레버리지 구간별 성과</h3>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
          {Object.entries(stats.byLeverage).map(([b, s]) => (
            <div key={b} className='bg-zinc-800/50 rounded p-2 text-center'>
              <div className='text-[10px] text-zinc-500'>{b}</div>
              <div className={`text-sm font-mono font-bold ${col(s.totalUsd)}`}>{usd(s.totalUsd)}</div>
              <div className='text-[10px] text-zinc-600'>{s.count}건 · 승 {s.winRate.toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* 누적 달러 곡선 */}
      <div className='bg-zinc-900 rounded-lg p-4'>
        <h3 className='text-xs font-medium text-zinc-400 mb-2'>누적 실현 손익 ($)</h3>
        <ResponsiveContainer width='100%' height={220}>
          <AreaChart data={cum} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id='cumFill' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='#3b82f6' stopOpacity={0.4} />
                <stop offset='100%' stopColor='#3b82f6' stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey='date' tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={48} />
            <ReferenceLine y={0} stroke='rgba(255,255,255,0.2)' strokeDasharray='2 2' />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
              formatter={((v: number) => [usd(Number(v)), '누적$']) as never}
            />
            <Area type='monotone' dataKey='cum' stroke='#3b82f6' strokeWidth={1.5} fill='url(#cumFill)' />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 최근 거래 */}
      <div className='bg-zinc-900 rounded-lg p-4'>
        <h3 className='text-xs font-medium text-zinc-400 mb-2'>최근 거래 ({trades?.length ?? 0})</h3>
        <div className='max-h-80 overflow-y-auto custom-scrollbar'>
          <table className='w-full text-[11px]'>
            <thead className='text-zinc-600 sticky top-0 bg-zinc-900'>
              <tr className='text-left'>
                <th className='py-1 font-normal'>일시</th>
                <th className='py-1 font-normal'>계정</th>
                <th className='py-1 font-normal'>심볼</th>
                <th className='py-1 font-normal text-right'>레버</th>
                <th className='py-1 font-normal text-right'>실현 $</th>
              </tr>
            </thead>
            <tbody className='font-mono'>
              {(trades ?? []).map(t => (
                <tr key={t.id} className='border-t border-zinc-800/60'>
                  <td className='py-1 text-zinc-400'>{new Date(t.closeTime).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className='py-1 text-zinc-500'>{t.account.replace('bybit_', '')}</td>
                  <td className='py-1 text-zinc-400'>{t.symbol.replace('USDT', '')}</td>
                  <td className='py-1 text-right text-zinc-500'>{t.leverage}x</td>
                  <td className={`py-1 text-right font-bold ${col(t.closedPnl)}`}>{usd(t.closedPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
