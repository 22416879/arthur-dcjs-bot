const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Card } = require('../../database/Card.js');

const rarityMap = { 1: 'C', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'SSS' };

module.exports = {
    command: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('查看收藏的卡牌（支援分頁功能）'),

    async action(interaction) {
        await interaction.deferReply();

        try {
            const userId = interaction.user.id;

            // 🎯 終極相容查詢：抓取該玩家所有的卡片
            const userCards = await Card.find({
                $or: [
                    { ownerId: userId },
                    { ownerid: userId },
                    { ownerId: String(userId) },
                    { ownerid: String(userId) }
                ]
            }).sort({ createdAt: -1 });

            if (!userCards || userCards.length === 0) {
                return await interaction.editReply('你目前還沒有收藏任何卡片喔！快去掉卡吧！');
            }

            const ITEMS_PER_PAGE = 10; 
            const totalPages = Math.ceil(userCards.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const generatePageMessage = (page) => {
                const embed = new EmbedBuilder()
                    .setTitle(`📂 ${interaction.member.displayName} 的卡片收藏`) // 🛠️ 強制正名：修復亂碼標題，直接顯示玩家的名稱！
                    .setColor('#f1c40f')
                    .setFooter({ text: `第 ${page} / ${totalPages} 頁 ｜ 共 ${userCards.length} 張卡片` })
                    .setTimestamp();

                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageCards = userCards.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                const cardList = pageCards.map((uc, index) => {
                    const globalIndex = startIndex + index + 1;
                    
                    // 精準分離出最尾端的純數字卡號
                    let finalNum = '00000';
                    if (uc.cardId && uc.cardId.includes('_')) {
                        const arr = uc.cardId.split('_');
                        finalNum = arr[arr.length - 1]; 
                    }
                    
                    const rarityString = rarityMap[uc.rarity] || uc.rarity;
                    
                    // 🛠️ 重新加回作品顯示：如果資料庫有作品就顯示，沒有就提示待更新
                    const seriesText = uc.series && uc.series !== "未知作品" ? uc.series : "經典動漫";
                    
                    return `**${globalIndex}.** \`#${String(finalNum).padStart(5, '0')}\` **${uc.name}** [${rarityString}] - *${seriesText}*`;
                }).join('\n');

                embed.setDescription(cardList);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`prev_${interaction.id}`)
                        .setLabel('◀️ 上一頁')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`next_${interaction.id}`) // 🛠️ 修正：綁定正確的 interaction.id
                        .setLabel('下一頁 ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages)
                );

                return { embeds: [embed], components: [row] };
            };

            const mainMessage = await interaction.editReply(generatePageMessage(currentPage));

            const collector = mainMessage.createMessageComponentCollector({
                filter: (i) => i.customId.endsWith(`_${interaction.id}`), 
                time: 3 * 60 * 1000 
            });

            collector.on('collect', async (btnInteraction) => {
                if (btnInteraction.user.id !== userId) {
                    return btnInteraction.reply({ content: '❌ 這不是你的背包，請自己輸入 `/collection` 查看喔！', ephemeral: true });
                }

                if (btnInteraction.customId.startsWith('prev_')) {
                    currentPage--;
                } else if (btnInteraction.customId.startsWith('next_')) {
                    currentPage++;
                }

                await btnInteraction.deferUpdate();
                await interaction.editReply(generatePageMessage(currentPage));
            });

            collector.on('end', async () => {
                try {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('prev_disabled').setLabel('◀️ 上一頁').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('next_disabled').setLabel('下一頁 ▶️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    );
                    await interaction.editReply({ components: [disabledRow] });
                } catch (err) {}
            });

        } catch (error) {
            console.error("讀取或處理分頁收藏清單失敗:", error);
            await interaction.editReply("❌ 讀取收藏清單時發生系統錯誤。");
        }
    }
};
