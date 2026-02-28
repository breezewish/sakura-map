import { describe, expect, it } from "vitest"

import { parseWeathernewsSpotForecastHtml } from "./weathernewsSpotForecastParser.mjs"

describe("parseWeathernewsSpotForecastHtml", () => {
  it("parses forecast dates from Weathernews spot html", () => {
    const html = `
<!doctype html>
<html lang="ja">
  <head>
    <title>菊池公園の花見・桜名所【2026】- ウェザーニュース - ウェザーニュース</title>
  </head>
  <body>
    <p class="kaikaStatus__date"> 最終取材日：1月29日</p>
    <dl class="kaikaList">
      <div class="kaikaList__item">
        <dt class="kaikaList__title color"> 開花予想日 </dt>
        <dd class="kaikaList__content">3月24日</dd>
      </div>
      <div class="kaikaList__item">
        <dt class="kaikaList__title"> 満開 </dt>
        <dd class="kaikaList__content">3月31日</dd>
      </div>
      <div class="kaikaList__item">
        <dt class="kaikaList__title"> 桜吹雪 </dt>
        <dd class="kaikaList__content">4月6日</dd>
      </div>
    </dl>
  </body>
</html>
`

    expect(parseWeathernewsSpotForecastHtml(html)).toEqual({
      forecasted_at: "2026-01-29",
      first_bloom_date: "2026-03-24",
      full_bloom_date: "2026-03-31",
      fubuki_date: "2026-04-06",
    })
  })

  it("parses forecasted_at from estimated status text", () => {
    const html = `
<!doctype html>
<html lang="ja">
  <head>
    <title>山北鉄道公園の花見・桜名所【2026】- ウェザーニュース - ウェザーニュース</title>
  </head>
  <body>
    <p class="kaikaStatus__date">2月28日の推定状況</p>
    <dl class="kaikaList">
      <div class="kaikaList__item">
        <dt class="kaikaList__title color"> 開花予想日 </dt>
        <dd class="kaikaList__content">3月23日</dd>
      </div>
    </dl>
  </body>
</html>
`

    expect(parseWeathernewsSpotForecastHtml(html)).toEqual({
      forecasted_at: "2026-02-28",
      first_bloom_date: "2026-03-23",
    })
  })

  it("returns null for non-spot pages", () => {
    const html = `
<!doctype html>
<html lang="ja">
  <head>
    <title>花見・桜名所【2026】｜さくら開花情報 - ウェザーニュース - ウェザーニュース</title>
  </head>
  <body>no forecast block</body>
</html>
`

    expect(parseWeathernewsSpotForecastHtml(html)).toBeNull()
  })
})
