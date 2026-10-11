# 東京咖啡巡禮 · Tokyo Coffee Journal

**網站：[blog.wulited.com/tokyo-cafe-pilgrimage](https://blog.wulited.com/tokyo-cafe-pilgrimage/)**

部署於 GitHub Pages，沿用帳號既有的自訂網域。原始 [GitHub Pages 網址](https://herointene.github.io/tokyo-cafe-pilgrimage/) 也會導向此站。

一份可以帶著散步的東京咖啡手帖。從原始 Excel 收錄 **69 家店鋪、20 個行政區**：36 家咖啡館、28 家喫茶店、5 家甜點店。暖色紙感、日文店名與街區散步提案，支援手機瀏覽。

## 使用

- 搜尋店名、車站、行政區或街區；依類型、行政區、巡禮狀態篩選。
- 每家店附網站或資訊來源與 Google Maps 連結。
- 店鋪筆記保留 Excel 的頁碼、車站與交通備註，另外補充查核地址和資料來源。
- 收藏想去的店、標記已巡禮；紀錄保存在目前瀏覽器，不會同步到伺服器或其他裝置。
- 銀座、藏前與淺草、青山三組散步提案；可切換清單顯示和排序，篩選條件可以從網址分享。

## 資料與查核

資料校對日期：**2026-10-11**。

| 來源標示 | 店鋪數 |
| --- | ---: |
| 店家或經營者官方網站 | 44 |
| 官方 Instagram | 10 |
| 其他官方社群 | 2 |
| 官方部落格 | 1 |
| 商業設施官方介紹 | 1 |
| 未確認自營官網或官方社群，提供第三方店鋪資訊 | 11 |

第三方餐廳目錄不標為官方網站。社群網址經公開店鋪資料交叉確認，可能要求登入；HTTP 檢查不代表營業狀態。未查得官網的店鋪仍完整收錄，資料不以猜測補齊。

Google Maps 優先使用公開的店家地圖網址；其他使用 Google 官方 Maps URLs 格式，以店名與完整地址搜尋。`mapType` 區分原有地圖連結與地址搜尋連結。出發前請查看店家最新營業公告。

特別保留 RBL CAFE 的頁碼修正與喫茶 半月的地址更新；珈琲西武使用歌舞伎町現址。MIYANO-YU 官網同時介紹姊妹店 HANARE，地址依目錄指定的 MIYANO-YU 分店校對。

- `data/source-shops.json`：原始 Excel 七欄的完整匯入，含工作表列號。
- `data/enrichment.json`：逐店查核的連結、地址、來源、介紹及備註。
- `data/shops.json`、`shops.js`：由來源合併產生的網站資料。
- `data/link-audit.json`：公開網頁連線與轉址查核紀錄；社群連結標記為可能需要登入。

原始 Excel 保留於本機，未上傳二進位檔；目錄內容已完整匯入 JSON。

## 本機預覽

純靜態 HTML、CSS、JavaScript，網站不需要安裝套件或設定 API 金鑰。

```sh
python3 -m http.server 4177 --bind 127.0.0.1
```

開啟 `http://127.0.0.1:4177/`。

更新目錄：

```sh
python3 scripts/import_excel.py /path/to/catalogue.xlsx
python3 scripts/build_data.py
python3 scripts/build_data.py --check
```

編輯 `data/enrichment.json` 後也需重新執行 `build_data.py`。匯入、合併和查核腳本使用 Python 標準函式庫。

## 驗證

`tests/smoke.mjs` 驗證 69 家店鋪的可見性、篩選結果、原始備註、收藏與巡禮保存、街區連動、鍵盤對話框和 320–1440px 顯示。測試需要 Playwright 和 Chromium；既有安裝可用 `PLAYWRIGHT_MODULE`、`CHROME_PATH` 指定。

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/smoke.mjs
```

設定 `SITE_URL` 可以在部署後對實際 Pages 網站執行相同驗證；測試紀錄只寫入測試瀏覽器。

## 部署與素材

GitHub Pages 從 `main` 分支根目錄發布，`.nojekyll` 讓靜態檔案直接上線。推送到 `main` 會更新網站。

封面照片：[Unsplash 原始素材](https://images.unsplash.com/photo-1495474472287-4d71bcdd2085)，遵循 [Unsplash License](https://unsplash.com/license)。照片為一般咖啡情境，並非收錄店鋪照片。圖示、街區示意及 favicon 為此網站以 SVG 製作。
