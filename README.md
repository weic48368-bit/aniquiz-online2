# AniQuiz 2.0

## 功能
- 即時多人房間（Socket.IO）
- 建立房間、5 碼房號加入
- 最多 12 位玩家
- 房主可選題目分類、難度、題數
- 每題 20 秒、四選一、即時分數與結算排名
- 目前內建超過 100 題，包含熱門作品與冷門佳作

## 本機執行
1. 安裝 Node.js 18 或更新版本
2. 在專案資料夾執行 `npm install`
3. 執行 `npm start`
4. 開啟 `http://localhost:3000`

## 部署到 Render
1. 將整個專案資料夾內容上傳到 GitHub repository 根目錄。
2. Render 選擇 New > Web Service，連接該 GitHub repository。
3. Runtime 選 Node，Build Command 填 `npm install`，Start Command 填 `npm start`。
4. 部署完成後開啟 Render 提供的網址。

注意：房間資料目前存在伺服器記憶體中；若 Render 重新啟動，進行中的房間會結束。正式長期營運可再加上 Redis 或資料庫。
