# 樱花地图（Sakura Spots Map）

一个用于浏览日本樱花名所/花见景点的地图应用。景点数据以 YAML 静态维护，并在开发/构建前预生成 JSON 供前端加载。

## 数据目录

- `src/data/spots/*.yml`
  - 静态维护的樱花景点数据（通过 PR 人工维护）。
- `src/data/spots_predict/*.yml`
  - **生成数据**：樱花花开时间预测（当前仅解析 Weathernews spot 页面）。
  - 该目录下的文件需要提交到仓库中（`git add`），以便线上直接展示。
- `public/data/spots.json`
  - 预构建数据集（由脚本从 `src/data/spots` + `src/data/spots_predict` 合并生成）。

## 开发

```bash
npm install
npm run dev
```

`npm run dev/build` 会自动执行 `scripts/build-spots-json.mjs` 生成/更新 `public/data/spots.json`。

## 更新花开时间预测（Weathernews）

该项目会从每个景点的 `links.weathernews`（若存在）抓取对应页面，并解析出：

- 开花予想日（初开）
- 満開（满开）
- 桜吹雪（樱吹雪）

运行脚本生成 `src/data/spots_predict/*.yml`：

```bash
node scripts/update-spots-predict-weathernews.mjs
```

然后重新生成前端使用的预构建数据：

```bash
node scripts/build-spots-json.mjs
```

最后将生成的预测数据提交到仓库：

```bash
git add src/data/spots_predict
```

## UI 设计语言

界面遵循「无边框、扁平化」设计语言，具体规则见：`design-system/樱花地图/DESIGN_LANGUAGE.md`。
