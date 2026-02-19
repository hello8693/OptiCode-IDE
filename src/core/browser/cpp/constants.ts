export const STD_OPTIONS = ['C++14', 'C++17', 'C++20', 'C++23'];
export const STD_DEFAULT = 'C++20';
export const OPT_OPTIONS = ['O2', 'Debug', 'Sanitize'];

export const STD_KEY = 'singlefile.cpp.std';
export const OPT_KEY = 'singlefile.cpp.opt';

export const CPP_PREFERENCE_IDS = {
  std: 'oi.cpp.standard',
  profile: 'oi.cpp.profile',
  flags: 'oi.cpp.flags',
  compilerPath: 'oi.cpp.compilerPath',
  // clangd 集成
  clangdPath: 'clangd.path',
  clangdArguments: 'clangd.arguments',
  clangdFallbackFlags: 'clangd.fallbackFlags',
  clangdAutoCompileCommands: 'clangd.autoGenerateCompileCommands',
};
