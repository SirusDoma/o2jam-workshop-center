# O2WC

[sirusdoma.github.io/o2jam-workshop-center/](https://sirusdoma.github.io/o2jam-workshop-center)  

O2Jam Workshop Center is a browser-based toolkit for inspecting, editing and building O2Jam assets, scene data, avatar tables, music lists, and client launch arguments.  

These tools run in your browser. Once the web app is loaded, no internet connection is ever required.

## Getting Started

The easiest way to start the app is to run it via docker compose:

```bash
docker compose up -d --build
```

Open <http://localhost:7500>.

## Development

Requires Node.js 22 and pnpm 11.  
The development server runs at <http://localhost:7500>.  

```bash
pnpm install
pnpm dev
```

Generate production build under the `dist` directory:

```bash
pnpm build
pnpm typecheck
```

## Documentation

- [CXO2 File Format](https://github.com/SirusDoma/CXO2/blob/develop/docs/file-format/FileFormat.md)
- [Mozart.Encore](https://github.com/SirusDoma/Mozart.Encore) (Parsers' implementations)

## License

Licensed under the [MIT License](LICENSE).
