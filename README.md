# 東京咖啡巡禮

[開啟咖啡手帖](https://blog.wulited.com/tokyo-cafe-pilgrimage/)

69 家東京咖啡館、喫茶店與甜點店，分布在 16 片街區。循著照片、車站和地圖，找到下一杯咖啡。

## 翻閱手帖

- **店鋪**：依街區、類型或車站尋找小店，查看照片、地址與店家連結。
- **地圖**：探索附近店鋪，開啟 Google Maps 安排散步。
- **交通**：沿電車路線查找咖啡車站，參考完整地下鐵與 JR 路線圖。
- **手帳**：收藏想去的店，蓋上巡禮章，記下日期、飲品與感想。

私人手帳保存在目前瀏覽器，不會跨裝置同步。可以下載備份；清除瀏覽器資料會移除紀錄。

## 店鋪與素材

店鋪連結分別標示官網、官方社群及公開店鋪介紹。地址、菜單與營業時間請以店家最新公告為準。

照片的署名與出處附於各圖，權利屬原作者。路線圖預覽的版本、語言及官方下載連結見 [素材來源](assets/reference/SOURCES.md)。

地圖使用 [Leaflet](https://leafletjs.com/)，底圖 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。

## 本機閱讀

網站為靜態 HTML、CSS 與 JavaScript。

```sh
python3 -m http.server 4177 --bind 127.0.0.1
```

開啟 `http://127.0.0.1:4177/`。

編輯店鋪資料後產生網站目錄：

```sh
python3 scripts/build_data.py
python3 scripts/build_data.py --check
```

GitHub Pages 從 `main` 分支發布。
