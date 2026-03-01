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

## 更新花开时间预测（JMC）

JMC 预测数据来自「お天気ナビゲータ」桜ナビ。脚本会**按县抓取一次** JMC 预测数据，然后按 spot 静态数据中记录的 `sources[label=jmc]` 元信息进行匹配，并仅更新 `src/data/spots_predict/*.yml` 中的 `predict.jmc` 字段（**不会改动 `predict.weathernews`**；JMC 也不提供樱吹雪数据）。

运行脚本生成/更新 `predict.jmc`：

```bash
node scripts/update-spots-predict-jmc.mjs
```

然后重新生成前端使用的预构建数据：

```bash
node scripts/build-spots-json.mjs
```

最后将生成的预测数据提交到仓库：

```bash
git add src/data/spots_predict
```

### 维护 JMC 元数据（一次性 + 少量增量）

- `src/data/jmc_prefecture_spots.yml`：JMC 每县点位索引（含 `code/name_ja`、每县预测更新时间），可通过脚本重新抓取生成：

```bash
node scripts/scrape-jmc-prefecture-spots.mjs
```

- `src/data/spots/*.yml`：spot 通过 `sources` 记录其在 JMC 对应的县级列表页与点位 code（必要时用 `name` 覆盖匹配名）：

```yml
sources:
  - label: jmc
    url: https://s.n-kishou.co.jp/w/sp/sakura/sakura_yosou?ba=13
    code: "13370003"
    name: 西新井大師
```

如果新增 spot 或发现匹配缺失，可用脚本辅助批量补全（名称 + 经纬度做保守匹配，建议运行后 review diff）：

```bash
node scripts/add-jmc-sources-to-spots.mjs
```

## UI 设计语言

界面遵循「无边框、扁平化」设计语言，具体规则见：`design-system/樱花地图/DESIGN_LANGUAGE.md`。
