// NativeWind v4 用の Metro 設定
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// 暫定: jest-worker child process exception の切り分けのため worker pool を 1 に絞る。
// これで潰れていた child process の真エラーが直接コンソールに出るはず。
// 原因確定後にこの行は撤去する。
config.maxWorkers = 1;

module.exports = withNativeWind(config, { input: './global.css' });
