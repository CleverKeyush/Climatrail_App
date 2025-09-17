const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore mobile-app directory to avoid conflicts
config.resolver.blockList = [/mobile-app\/.*/];

module.exports = config;