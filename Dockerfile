# 使用內建完整圖形與字型依賴庫的專用基底
FROM ghcr.io/puppeteer/puppeteer:20.9.0

# 切換到 root 權限
USER root

# 設定專案工作目錄
WORKDIR /app

# 複製設定檔並利用 yarn 安裝套件（它會自動讀取剛剛在後台設定的 npmmirror 鏡像源速度極快）
COPY package*.json ./
RUN yarn install

# 複製專案所有代碼
COPY . .

# 處理客製化字型
RUN mkdir -p /usr/share/fonts/truetype/custom \
    && cp -r ./fonts/* /usr/share/fonts/truetype/custom/ 2>/dev/null || true \
    && fc-cache -f -v

# 啟動機器人命令
CMD ["node", "src/main.js"]
