module.exports = function (api) {
  // env を参照する場合は cache.using で env-aware に
  api.cache.using(() => process.env.NODE_ENV);
  const isTest = api.env('test');
  if (isTest) {
    // jest 環境では NativeWind の jsx-runtime ラッパーを外す。
    // className 検査はテスト対象外 (依頼書 §2.2、§8.6 アンチパターン) のため、
    // 標準 react jsx-runtime でテスト時のみ動作させる。
    return {
      presets: [['babel-preset-expo']],
      plugins: ['react-native-reanimated/plugin'],
    };
  }
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated must be the LAST plugin
      'react-native-reanimated/plugin',
    ],
  };
};
