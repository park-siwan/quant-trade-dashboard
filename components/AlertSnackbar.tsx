'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Bell, Volume2, Check, Trash2, Play } from 'lucide-react';

export interface AlertItem {
  id: string;
  type: 'entry' | 'strong_signal' | 'divergence';
  direction: 'long' | 'short' | 'bullish' | 'bearish';
  message: string;
  timestamp: number;
  read: boolean;
  timeframe?: string;
  score?: number;
  riskReward?: number;
}

interface AlertSnackbarProps {
  alerts: AlertItem[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onReplay?: (alert: AlertItem) => void;
  isPlaying?: boolean;
}

// 시간 포맷
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

// 경과 시간
const getTimeAgo = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
};

// 알림 아이콘/색상
const getAlertStyle = (type: AlertItem['type'], direction: AlertItem['direction']) => {
  if (type === 'strong_signal') {
    return direction === 'long' || direction === 'bullish'
      ? { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400', label: '강한 롱 신호' }
      : { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400', label: '강한 숏 신호' };
  }
  if (type === 'entry') {
    return direction === 'long'
      ? { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400', label: '롱 타점' }
      : { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400', label: '숏 타점' };
  }
  // divergence
  return direction === 'bullish'
    ? { bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', text: 'text-cyan-400', label: '상승 다이버전스' }
    : { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400', label: '하락 다이버전스' };
};

export default function AlertSnackbar({
  alerts,
  onDismiss,
  onDismissAll,
  onMarkRead,
  onMarkAllRead,
  onReplay,
  isPlaying = false,
}: AlertSnackbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const unreadCount = alerts.filter(a => !a.read).length;

  // 읽지 않은 알림이 있으면 자동으로 펼치기
  useEffect(() => {
    if (unreadCount > 0 && !isExpanded) {
      setIsExpanded(true);
    }
  }, [unreadCount]);

  return (
    <>
      {/* 접힌 상태 - 알림함 버튼 (우측 하단 고정) */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl backdrop-blur-xl shadow-lg transition-all hover:scale-105 ${
            unreadCount > 0
              ? 'bg-blue-500/20 border border-blue-500/30'
              : 'bg-gray-800/90 border border-white/10 hover:bg-gray-700/90'
          }`}
        >
          <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-blue-400' : 'text-gray-400'}`} />
          <span className="text-sm text-gray-300">알림함</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* 펼친 상태 - 알림 목록 */}
      {isExpanded && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
        <div className="backdrop-blur-xl bg-gray-900/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-300">알림함</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded transition-colors"
                  title="모두 읽음"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={onDismissAll}
                className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded transition-colors"
                title="모두 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded transition-colors"
                title="접기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 알림 목록 */}
          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-sm">알림이 없습니다</span>
                <span className="text-xs text-gray-600 mt-1">신호 발생 시 여기에 표시됩니다</span>
              </div>
            ) : (
              alerts.map((alert) => {
                const style = getAlertStyle(alert.type, alert.direction);
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 transition-colors cursor-pointer hover:bg-white/5 ${
                      alert.read ? 'opacity-60' : 'bg-white/5'
                    }`}
                    onClick={() => !alert.read && onMarkRead(alert.id)}
                  >
                    {/* 아이콘 */}
                    <div className={`flex-shrink-0 p-1.5 rounded ${style.bg} ${style.border} border`}>
                      <Volume2 className={`w-3.5 h-3.5 ${style.text}`} />
                    </div>
                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${style.text}`}>
                          {style.label}
                        </span>
                        {alert.timeframe && (
                          <span className="text-[10px] text-gray-500">{alert.timeframe}</span>
                        )}
                        {!alert.read && (
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{alert.message}</p>
                      <span className="text-[10px] text-gray-600">{getTimeAgo(alert.timestamp)}</span>
                    </div>
                    {/* 재생 */}
                    {onReplay && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplay(alert);
                        }}
                        disabled={isPlaying}
                        className={`flex-shrink-0 p-1.5 rounded transition-colors ${
                          isPlaying
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/20'
                        }`}
                        title="다시 듣기"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                    {/* 삭제 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(alert.id);
                      }}
                      className="flex-shrink-0 p-1 text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>
      )}
    </>
  );
}
