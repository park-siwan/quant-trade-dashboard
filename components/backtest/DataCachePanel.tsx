'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCacheStatus,
  downloadCacheData,
  deleteCache,
  CacheStatus,
  CacheItem,
  CacheDownloadProgress,
} from '@/lib/backtest-api';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [2025, CURRENT_YEAR].filter((v, i, arr) => arr.indexOf(v) === i); // 중복 제거

export default function DataCachePanel() {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // 선택된 다운로드 옵션
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [forceDownload, setForceDownload] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCacheStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cache status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleDownload = async () => {
    const key = `${selectedSymbol}_${selectedTimeframe}_${selectedYear}`;
    setDownloading(key);
    setDownloadMessage('다운로드 시작...');
    setError(null);

    try {
      await downloadCacheData(
        selectedSymbol,
        selectedTimeframe,
        selectedYear,
        forceDownload,
        (progress: CacheDownloadProgress) => {
          if (progress.message) {
            setDownloadMessage(progress.message);
          }
        },
      );
      setDownloadMessage('완료!');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
      setTimeout(() => setDownloadMessage(''), 3000);
    }
  };

  const handleDelete = async (item: CacheItem) => {
    if (!confirm(`${item.symbol} ${item.timeframe} ${item.year} 캐시를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteCache(item.symbol, item.timeframe, item.year);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const getCacheKey = (symbol: string, timeframe: string, year: number) =>
    `${symbol}_${timeframe}_${year}`;

  const isCached = (symbol: string, timeframe: string, year: number) => {
    if (!status) return false;
    return status.cached.some(
      (c) => c.symbol === symbol && c.timeframe === timeframe && c.year === year
    );
  };

  const getCacheInfo = (symbol: string, timeframe: string, year: number): CacheItem | undefined => {
    if (!status) return undefined;
    return status.cached.find(
      (c) => c.symbol === symbol && c.timeframe === timeframe && c.year === year
    );
  };

  const formatNumber = (n: number) => n.toLocaleString();

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading && !status) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="text-zinc-400 text-sm">캐시 상태 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">데이터 캐시 관리</h3>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="text-xs text-zinc-400 hover:text-white transition-colors"
        >
          {loading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">
          {error}
        </div>
      )}

      {/* 다운로드 폼 */}
      <div className="bg-zinc-800/50 p-3 rounded-lg space-y-3">
        <div className="text-sm text-zinc-300 font-medium">데이터 다운로드</div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">심볼</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-zinc-700 text-white text-sm px-2 py-1.5 rounded border border-zinc-600"
            >
              {status?.symbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">타임프레임</label>
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="w-full bg-zinc-700 text-white text-sm px-2 py-1.5 rounded border border-zinc-600"
            >
              {status?.timeframes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">연도</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full bg-zinc-700 text-white text-sm px-2 py-1.5 rounded border border-zinc-600"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleDownload}
              disabled={!!downloading}
              className={`w-full py-1.5 rounded text-sm font-medium transition-colors ${
                downloading
                  ? 'bg-zinc-600 text-zinc-400'
                  : isCached(selectedSymbol, selectedTimeframe, selectedYear)
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {downloading
                ? '다운로드 중...'
                : isCached(selectedSymbol, selectedTimeframe, selectedYear)
                ? '업데이트'
                : '다운로드'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forceDownload}
              onChange={(e) => setForceDownload(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            <span className="text-xs text-zinc-400">강제 재다운로드</span>
          </label>

          {downloadMessage && (
            <span className="text-xs text-green-400">{downloadMessage}</span>
          )}
        </div>
      </div>

      {/* 캐시 상태 테이블 */}
      <div className="space-y-2">
        <div className="text-sm text-zinc-300 font-medium">캐시된 데이터</div>

        {status?.cached.length === 0 ? (
          <div className="text-zinc-500 text-sm py-4 text-center">
            캐시된 데이터가 없습니다. 위에서 다운로드하세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 text-xs border-b border-zinc-700">
                  <th className="text-left py-2 px-2">심볼</th>
                  <th className="text-center py-2 px-2">TF</th>
                  <th className="text-center py-2 px-2">연도</th>
                  <th className="text-right py-2 px-2">캔들</th>
                  <th className="text-right py-2 px-2">OI</th>
                  <th className="text-center py-2 px-2">업데이트</th>
                  <th className="text-center py-2 px-2 w-16">액션</th>
                </tr>
              </thead>
              <tbody>
                {status?.cached.map((item) => (
                  <tr
                    key={getCacheKey(item.symbol, item.timeframe, item.year)}
                    className="border-b border-zinc-800 hover:bg-zinc-800/50"
                  >
                    <td className="py-2 px-2 text-white font-medium">{item.symbol}</td>
                    <td className="py-2 px-2 text-center text-zinc-300">{item.timeframe}</td>
                    <td className="py-2 px-2 text-center text-zinc-300">{item.year}</td>
                    <td className="py-2 px-2 text-right text-green-400">
                      {formatNumber(item.candleCount)}
                    </td>
                    <td className="py-2 px-2 text-right text-blue-400">
                      {item.oiCount > 0 ? formatNumber(item.oiCount) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center text-zinc-500 text-xs">
                      {formatDate(item.lastUpdated)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 빠른 다운로드 그리드 - 타임프레임별 */}
      <div className="space-y-3">
        <div className="text-sm text-zinc-300 font-medium">빠른 다운로드</div>

        {/* 타임프레임 탭 */}
        {['5m', '15m', '1h'].map((tf) => (
          <div key={tf} className="bg-zinc-800/30 p-2 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-zinc-400 w-10">{tf}</span>
              <div className="flex-1 h-px bg-zinc-700" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {status?.symbols.slice(0, 4).map((symbol) => (
                <div key={`${symbol}-${tf}`} className="space-y-1">
                  <div className="text-xs text-zinc-500">{symbol.replace('USDT', '')}</div>
                  <div className="flex gap-1">
                    {YEARS.map((year) => {
                      const cached = isCached(symbol, tf, year);
                      const info = getCacheInfo(symbol, tf, year);
                      const isDownloading = downloading === getCacheKey(symbol, tf, year);

                      return (
                        <button
                          key={year}
                          onClick={() => {
                            if (cached || isDownloading) return;
                            setSelectedSymbol(symbol);
                            setSelectedTimeframe(tf);
                            setSelectedYear(year);
                            setDownloading(getCacheKey(symbol, tf, year));
                            setDownloadMessage(`${symbol} ${tf} ${year} 다운로드 중...`);
                            downloadCacheData(symbol, tf, year, false, (p) => {
                              if (p.message) setDownloadMessage(p.message);
                            })
                              .then(() => {
                                setDownloadMessage('완료!');
                                loadStatus();
                              })
                              .catch((err) => setError(err.message))
                              .finally(() => {
                                setDownloading(null);
                                setTimeout(() => setDownloadMessage(''), 3000);
                              });
                          }}
                          disabled={cached || isDownloading}
                          className={`flex-1 py-1 text-xs rounded transition-colors ${
                            isDownloading
                              ? 'bg-blue-600 text-white animate-pulse'
                              : cached
                              ? 'bg-green-900/50 text-green-400 cursor-default'
                              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                          }`}
                          title={
                            cached && info
                              ? `✓ ${formatNumber(info.candleCount)} candles`
                              : `${symbol} ${tf} ${year} 다운로드`
                          }
                        >
                          {isDownloading ? '...' : cached ? '✓' : year.toString().slice(2)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-zinc-500">
          녹색(✓)=캐시됨, 회색=미다운로드 (클릭하면 다운로드)
        </p>
      </div>
    </div>
  );
}
