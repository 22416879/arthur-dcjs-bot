import { Client, Events, GatewayIntentBits } from 'discord.js';
import vueinit from '@/core/vue.js';
import dotenv from 'dotenv';
import { useAppStore } from '@/store/app.js';
import { loadCommands, loadEvents } from '@/core/loader.js';
import { connectDB } from '@/database/connect.js';

vueinit();
dotenv.config();

await connectDB();

// 🛠️ 修正 1：必須開啟 GuildMessages 與 MessageContent 權限，機器人才能接收聊天室文字！
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,  // 👈 監聽訊息必備
        GatewayIntentBits.MessageContent  // 👈 讀取訊息文字必備
    ] 
});

const appStore = useAppStore();
appStore.client = client;
await loadCommands();
await loadEvents();

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// ======= 💡 玩家快捷鍵監聽系統 (ad / acd / ac / av / at / ab) =======
// ======= 💡 玩家快捷鍵監聽系統 (ad / acd / ac / av / at / ab) =======
// ======= 💡 玩家快捷鍵監聽系統 (ad / acd / ac / av / at / ab) =======
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const commandName = message.content.toLowerCase().trim();

    const shortcutMap = {
        'ad': 'drop',
        'acd': 'cooldown',
        'ac': 'collection',
        'av': 'view',
        'at': 'trade',
        'ab': 'burn'
    };

    if (shortcutMap[commandName]) {
        const targetCommandName = shortcutMap[commandName];
        
        const actionFunction = appStore.commandsActionMap ? appStore.commandsActionMap.get(targetCommandName) : null;
        if (!actionFunction) return;

        // 建立 100% 完美相容的偽裝 Interaction 物件
        const mockInteraction = {
            // 🛠️ 修正：不要帶有 _mock 後綴，直接讓 ID 保持純字串，防止按鈕按下去切頁失效
            id: String(message.id), 
            user: message.author,
            member: message.member,
            guild: message.guild,
            client: message.client,
            deferred: false,
            replied: false,
            // 模擬延遲回覆
            deferReply: async (options) => {
                mockInteraction.deferred = true;
                mockInteraction.mainMsg = await message.channel.send('⏳ 正在載入中，請稍候...');
                return mockInteraction.mainMsg;
            },
            reply: async (contentObj) => {
                mockInteraction.replied = true;
                const finalContent = typeof contentObj === 'string' ? contentObj : (contentObj.content || '❌ 發生攔截');
                return message.reply(finalContent);
            },
            // 🛠️ 終極修正：將 embeds 還有 payloads 完美渲染出來，徹底解鎖「正在載入中」卡住的問題！
            editReply: async (contentObj) => {
                mockInteraction.replied = true;
                if (mockInteraction.mainMsg) {
                    const updatePayload = {};
                    
                    // 1. 處理文字內容
                    if (contentObj.content !== undefined) updatePayload.content = contentObj.content;
                    else updatePayload.content = null; // 清除「正在載入中」的文字

                    // 2. 處理 Embeds 面板（ac 和 acd 最核心的精美看版）
                    if (contentObj.embeds) updatePayload.embeds = contentObj.embeds;

                    // 3. 處理按鈕組件（上一頁、下一頁）
                    if (contentObj.components) updatePayload.components = contentObj.components;

                    // 4. 處理大圖檔案（drop 掉卡專用）
                    if (contentObj.files) updatePayload.files = contentObj.files;

                    return mockInteraction.mainMsg.edit(updatePayload);
                } else {
                    return message.channel.send(contentObj);
                }
            },
            followUp: async (contentObj) => {
                if (typeof contentObj === 'string') {
                    return message.channel.send(contentObj);
                }
                return message.channel.send({
                    content: contentObj.content || null,
                    embeds: contentObj.embeds || [],
                    components: contentObj.components || [],
                    files: contentObj.files || []
                });
            }
        };

        try {
            // 執行指令邏輯！
            await actionFunction(mockInteraction);
        } catch (error) {
            console.error(`執行快捷鍵 ${commandName} 失敗:`, error);
            // 發生錯誤時自動把卡住的訊息刪除
            if (mockInteraction.mainMsg) await mockInteraction.mainMsg.delete().catch(() => {});
            message.reply(`❌ 執行快捷指令時發生未知錯誤。`);
        }
    }
});


client.login(process.env.token);
