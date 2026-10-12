# 發佈旅途手帖

網站有兩種公開內容：作者發佈的旅途手帖，以及每家店的讀者留言。私人手帳不會自動公開。

## 挑選自己的巡禮紀錄

1. 使用有私人紀錄的同一個瀏覽器，開啟 [作者選稿頁面](https://blog.wulited.com/tokyo-cafe-pilgrimage/?editor=1#notebook)。
2. 展開「準備公開手帳」，填寫署名，勾選想分享的紀錄。
3. 檢查照片、日期、巡禮章與文字預覽，再按「下載公開選稿」。

下載的是 `tokyo-coffee-public-notes.json`，只包含勾選的紀錄。下載本身不會發佈，也不會改動私人手帳。「下載手帳」則是包含私人紀錄的完整備份，請勿將該備份提交到公開倉庫。

`?editor=1` 只開啟瀏覽器內的選稿工具；網站沒有上傳帳號憑證。實際發佈需要 GitHub 倉庫的寫入權限。

## 匯入與發佈

在本機倉庫根目錄執行，將檔案路徑換成下載位置：

```sh
python3 scripts/import_public_journal.py ~/Downloads/tokyo-coffee-public-notes.json --check
python3 scripts/import_public_journal.py ~/Downloads/tokyo-coffee-public-notes.json
git diff -- data/public-journal.json
```

檢查 `data/public-journal.json` 確實只包含要公開的內容，再提交：

```sh
git add data/public-journal.json
git commit -m "Publish coffee field notes"
git push origin main
```

GitHub Pages 完成部署後，紀錄會出現在首頁「旅途手帖」與對應店鋪。沒有已發佈紀錄時，首頁不顯示空白的手帖區。

選稿的 ID 由店鋪與日期組成。同一個 ID 再次匯入會更新該篇；不同日期會新增紀錄，之前的公開手帖仍然保留。未勾選的紀錄不會被刪除。若更改了舊篇的日期，請確認是否也要撤下原日期的紀錄。

## 更新或撤下

文字可在私人手帳修改後重新選稿匯入；也可直接編輯公開 JSON。檢查資料格式：

```sh
python3 scripts/import_public_journal.py --check
```

撤下特定紀錄時，使用它的 `id`，例如：

```sh
python3 scripts/import_public_journal.py --remove cafe-012--2026-10-12
```

之後提交並 push 更新。撤下會移除網站目前顯示的紀錄；已提交到公開 GitHub 倉庫的舊版本仍可能存在於 Git 歷史中。

## 店鋪留言

每家店的「店鋪留言」使用 [giscus](https://giscus.app/) 與倉庫的 [GitHub Discussions](https://github.com/herointene/tokyo-cafe-pilgrimage/discussions)。閱讀免登入；發表留言需要 GitHub 帳號。留言立即公開，不經作者手帖的選稿流程。

店鋪以固定 ID 對應自己的討論，例如 `tokyo-cafe:cafe-012`。分類為 `Announcements`，使用嚴格標題比對。讀者可編輯或刪除自己的留言，倉庫管理員可在 GitHub 管理討論。

使用 `?shop=cafe-012` 可直接分享某家店的資訊與留言入口。
