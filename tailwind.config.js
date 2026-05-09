/** @type {import('tailwindcss').Config} */
// NativeWind 用の Tailwind 設定。
// デザインシステム v0.2 のカラー / タイポ / 余白トークンを theme.extend で吸収する。
// 参照: 02_設計/デザインシステム.md v0.2

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // プライマリ・セマンティック
        primary: '#FF8FA3',
        'primary-dark': '#E76A85',
        'primary-light': '#FFD0DA',
        secondary: '#FFB088',
        // 背景
        background: '#FFF8F5',
        surface: '#FFFFFF',
        // テキスト
        'text-primary': '#2D1F1A',
        'text-secondary': '#6B5D55',
        // 区切り
        border: '#E8DDD6',
        // ステータス
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
      fontSize: {
        // デザインシステム §4 タイポグラフィ
        display: ['32px', { fontWeight: '700' }],
        h1: ['24px', { fontWeight: '700' }],
        h2: ['20px', { fontWeight: '600' }],
        h3: ['17px', { fontWeight: '600' }],
        body: ['15px', { fontWeight: '400' }],
        caption: ['13px', { fontWeight: '400' }],
        tiny: ['11px', { fontWeight: '400' }],
      },
      spacing: {
        // デザインシステム §5 8の倍数ベース
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '24px',
        6: '32px',
        8: '64px',
      },
      borderRadius: {
        card: '12px',
        button: '12px',
      },
      minHeight: {
        // タップターゲット最小 44dp
        tap: '44px',
        button: '48px',
        fab: '56px',
        row: '56px',
      },
    },
  },
  plugins: [],
};
