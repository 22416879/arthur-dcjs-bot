# 使用內建完整圖形與字型依賴庫的專用基底
FROM ghcr.io/puppeteer/puppeteer:20.9.0

# 切換到 root 權限以便複製與處理字型
USER root

# 設定專案工作目錄
WORKDIR /app

# 💡 複製 package.json 與 yarn.lock 並改用 yarn 安裝全部套件
COPY package*.json yarn.lock* ./
RUN yarn install

# 複製專案所有代碼
COPY . .

# 處理客製化字型
RUN mkdir -p /usr/share/fonts/truetype/custom \
    && cp -r ./fonts/* /usr/share/fonts/truetype/custom/ 2>/dev/null || true \
    && fc-cache -f -v

# 啟動機器人命令
CMD ["node", "src/main.js"]
