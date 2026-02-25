# 樱花地图

## 樱花景点数据源

为了保证质量，樱花景点信息是静态数据，通过 Pull Request 人工维护，主要从以下几个数据源收集：

- 日本さくら名所100選 https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E3%81%95%E3%81%8F%E3%82%89%E5%90%8D%E6%89%80100%E9%81%B8
- https://travel.navitime.com/ja/area/jp/feature/hanami/
- https://weathernews.jp/sakura/

每个景点信息都包含以下信息：

- ID（一般使用其英文名称）
- 名称（日文）
- 位置（县、市、区）
- Geo Location 经纬度
- 樱花盛开时的照片
- 樱花棵树
- 樱花种类
- 简介
- 上述信息来源的 URL（可多个）
- NAVITIME 链接
- Weathernews 链接
- 所属集合（可多个，日本さくら名所100選 / NAVITIME / Weathernews / ...）
- 备注（界面上不显示，仅供数据维护人员使用）

一般各个景点信息主要提取自 NAVITIME 和 Weathernews 提供的详细信息，例如 https://travel.navitime.com/ja/area/jp/spot/90011-sak1300031/ 和 https://weathernews.jp/sakura/spot/52011/ ，但也会参考其他数据源的信息进行补充和修正。所有参考来源的 URL 都会被记录，以便后续审阅和维护。

上述几个数据源中的景点信息有很多重复，重复数据经过人工审阅、剔除和合并。

所有景点信息按县分类，便于维护。

## 地图界面

地图仅显示日本地图。对于地图上的樱花景点信息，用户可按不同类型进行筛选切换：

- 集合：日本さくら名所100選、NAVITIME、Weathernews
- 县

默认显示全部景点信息。

樱花景点信息以标记点的形式显示在地图上，标记点的颜色根据所属集合进行区分，樱花名所为粉色，非樱花名所为蓝色。标记点大小是按樱花棵树硬编码的（未知或 < 500 棵、< 2000 棵、>= 2000 棵）。
