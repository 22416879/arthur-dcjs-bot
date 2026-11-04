const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    command: new SlashCommandBuilder()
        .setName('cooldown')
        .setDescription('顯示當前搶卡與掉卡的剩餘冷卻時間'),

    async action(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const userId = interaction.user.id;
            const now = Date.now();

            const DROP_COOLDOWN_TOTAL = 1 * 60 * 1000;      
            const CLAIM_COOLDOWN_TOTAL = 1 * 60 * 1000;    

            let dropCooldownText = "✅ **準備就緒** ｜ 隨時可以使用 `/drop`！";
            let claimCooldownText = "✅ **準備就緒** ｜ 隨時可以參與搶卡！";

            // 🛠️ 修正：直接從唯一且絕對同步的 client 物件中提取資料
            const dropCooldowns = interaction.client.dropCooldowns;
            const btnCooldowns = interaction.client.btnCooldowns;

            // 1. 計算掉卡剩餘時間
            if (dropCooldowns && dropCooldowns.has(userId)) {
                const expire = dropCooldowns.get(userId) + DROP_COOLDOWN_TOTAL;
                if (now < expire) {
                    const diff = expire - now;
                    const mins = Math.floor(diff / 1000 / 60);
                    const secs = Math.floor((diff / 1000) % 60);
                    dropCooldownText = `⏳ **冷卻中** ｜ 剩餘 **${mins}分 ${secs}秒**`;
                }
            }

            // 2. 計算搶卡按鈕剩餘時間
            if (btnCooldowns && btnCooldowns.has(userId)) {
                const expire = btnCooldowns.get(userId) + CLAIM_COOLDOWN_TOTAL;
                if (now < expire) {
                    const diff = expire - now;
                    const mins = Math.floor(diff / 1000 / 60);
                    const secs = Math.floor((diff / 1000) % 60);
                    claimCooldownText = `⏳ **冷卻中** ｜ 剩餘 **${mins}分 ${secs}秒**`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`⏳ ${interaction.member.displayName} 的指令冷卻狀態`)
                .setColor('#3498db')
                .addFields(
                    { name: '🎲 掉卡冷卻狀態 (`/drop`)', value: dropCooldownText, inline: false },
                    { name: '🖐️ 搶卡按鈕冷卻狀態', value: claimCooldownText, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("讀取冷卻狀態失敗:", error);
            await interaction.editReply("❌ 讀取冷卻進度時發生系統錯誤。");
        }
    }
};
