// Copies the files the browser loads at run time (DWG reader, PDF worker) into public/.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("public/wasm", { recursive: true });
cpSync("node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm", "public/wasm/libredwg-web.wasm");
cpSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
