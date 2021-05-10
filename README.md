# 📜 Buffered File System (BFS) 📜

[![Node 10.x](https://github.com/foresthoffman/bfs/actions/workflows/node-10.x.js.yml/badge.svg)](https://github.com/foresthoffman/bfs/actions/workflows/node-10.x.js.yml) [![Node 12.x](https://github.com/foresthoffman/bfs/actions/workflows/node-12.x.js.yml/badge.svg)](https://github.com/foresthoffman/bfs/actions/workflows/node-12.x.js.yml) [![Node 14.x](https://github.com/foresthoffman/bfs/actions/workflows/node-14.x.js.yml/badge.svg)](https://github.com/foresthoffman/bfs/actions/workflows/node-14.x.js.yml)

This module uses buffers (or Tar streams) to load file systems (FS) into memory. From an FS, files can be read and modules can be required recursively, without touching the host file system.

## NPM

```bash
npm i @foresthoffman/bfs
```

## Yarn

```bash
yarn add @foresthoffman/bfs
```

## Testing

```
yarn test
```
