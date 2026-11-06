const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Card } = require('../../database/Card.js');
const mongoose = require('mongoose');

const rarityMap = { 1: 'C', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'SSS' };

module.exports = {
    command: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('查看收藏的卡牌（支援分頁功能）'),

    async action(interaction) {
        await interaction.deferReply();

        try {
            const userId = interaction.user.id;

            // 1. 撈取玩家個人背包的所有卡片 (test 資料表)
            const userCards = await Card.find({
                $or: [
                    { ownerId: userId },
                    { ownerid: userId },
                    { ownerId: String(userId) },
                    { ownerid: String(userId) }
                ]
            }).sort({ createdAt: -1 }).lean();

            if (!userCards || userCards.length === 0) {
                return await interaction.editReply('你目前還沒有收藏任何卡片喔！快去掉卡吧！');
            }

            // 🎯 核心補強：直接連線到圖鑑模板表 (cards Collection)
            const cardsCollection = mongoose.connection.useDb('card_bot_db').collection('cards');
            // 一口氣把全圖鑑撈出來，方便在記憶體中進行 0 毫秒極速跨表智慧對碰
            const globalCards = await cardsCollection.find({}).toArray();

            const ITEMS_PER_PAGE = 10; 
            const totalPages = Math.ceil(userCards.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const generatePageMessage = (page) => {
                const embed = new EmbedBuilder()
                    .setTitle(`📂 ${interaction.member.displayName} 的卡片收藏`) 
                    .setColor('#f1c40f')
                    .setFooter({ text: `第 ${page} / ${totalPages} 頁 ｜ 共 ${userCards.length} 張卡片` })
                    .setTimestamp();

                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageCards = userCards.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                const cardList = pageCards.map((uc, index) => {
                    const globalIndex = startIndex + index + 1;
                    
                    // 分離出最尾端的純數字卡號 (相容底線和斜線)
                    let finalNum = '00000';
                    let currentPublicId = '';
                    const rawId = uc.cardid || uc.cardId || '';
                    
                    if (String(rawId).includes('_')) {
                        const arr = String(rawId).split('_');
                        finalNum = arr[arr.length - 1]; 
                        currentPublicId = arr[0]; // 取得對照用的 cloudinaryPublicId
                    } else if (String(rawId).includes('/')) {
                        const arr = String(rawId).split('/');
                        finalNum = arr[arr.length - 1];
                        currentPublicId = arr.slice(0, -1).join('/');
                    } else {
                        finalNum = String(rawId).replace('#', '');
                    }
                    const numMatch = String(finalNum).match(/\d+/);
                    const formattedNum = numMatch ? String(numMatch).padStart(5, '0') : '00000';
                    
                    const rarityString = rarityMap[uc.rarity] || uc.rarity || 'C';
                    const seriesText = uc.series && uc.series !== "未知作品" ? uc.series : "經典動漫";
                    
                    // 🎯 智慧跨表對碰：拿著背包卡的 cloudinaryPublicId，去圖鑑表尋找對應的卡片物件
                    const matchedGlobalCard = globalCards.find(gc => 
                        gc.cloudinaryPublicId === currentPublicId || 
                        gc.imageUrl === uc.imageUrl || 
                        gc.imageLink === uc.imageUrl
                    );

                    // 🎯 成功抓到圖鑑表裡面的 code，若背包有存 code 則優先用背包的
                    const shortCode = String(uc.code || matchedGlobalCard?.code || '######').toLowerCase();
                    
                    return `**${globalIndex}.** \`[${shortCode}]\` \`#${formattedNum}\` **${uc.name || uc.characterName || '未知角色'}** [${rarityString}] - *${seriesText}*`;
                }).join('\n');

                embed.setDescription(cardList);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`prev_${interaction.id}`)
                        .setLabel('◀️ 上一頁')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`next_${interaction.id}`) 
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
