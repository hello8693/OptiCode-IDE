# OptiCode IDE
一款适用于算法竞赛的代码编辑器。

## Contributing

### Preparation
- install Node.js >= 20
- you can use npmmirror.com to speed up the installation in china
  - `yarn config set -H npmRegistryServer "https://registry.npmmirror.com"`
  - `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

### Start the project
```bash
# install dependencies
yarn
# rebuild native dependencies for electron
yarn run electron-rebuild
# start project
yarn run start
```

### Start the web project (experimental)
```bash
# install dependencies
yarn
# rebuild native dependencies for web
yarn run web-rebuild
# build web
yarn run build-web
# start project, visit http://localhost:8080 or http://localhost:8080/?workspaceDir=workspace_dir
yarn run start-web
```

