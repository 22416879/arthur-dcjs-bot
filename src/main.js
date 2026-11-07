import { Client, Events, GatewayIntentBits } from 'discord.js';
import vueinit from './core/vue.js';           // 💡 第 2 行修正
import dotenv from 'dotenv';
import { useAppStore } from './store/app.js';    // 💡 第 4 行修正
import { loadCommands, loadEvents } from './core/loader.js'; // 💡 第 5 行修正
import { connectDB } from './database/connect.js'; // 💡 第 6 行修正


// 在 src/main.js 的最頂層加入這段：
//  正確的 ESM 寫法
import { registerFont } from 'canvas';
import path from 'path';
import fs from 'fs';


// 💡 請將 main.js 第 16、17 行修正為這兩行（補上 'src'）：
const f1 = path.join(process.cwd(), 'src', 'fonts', 'Mantiousans-regular.ttf');
const f2 = path.join(process.cwd(), 'src', 'fonts', 'font2.OTF');


if (fs.existsSync(f1)) {
    registerFont(f1, { family: 'Mantousans Regular' });
    console.log("[System] 全域字型 1 註冊成功");
} else {
    console.log(`[Error] 找不到字型 1 檔案，路徑為: ${f1}`);
}

// 💡 請將 main.js 中原本註冊 f2 的那段改成這樣：
// 💡 在 src/main.js 中，把名稱改成完全乾淨的 'MyLevelFont'
if (fs.existsSync(f2)) {
    registerFont(f2, { family: 'MyLevelFont' }); 
    console.log("[System] 全域字型 2 (MyLevelFont) 註冊成功");
} else {
    console.log(`[Error] 找不到字型 2 檔案，路徑為: ${f2}`);
}


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
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. 將輸入內容用「空格」切開成陣列。例如 "av #00000" -> ["av", "#00000"]
    const args = message.content.trim().split(/ +/);
    if (args.length === 0) return;

    // 2. 精準拿取陣列第一個字當指令（轉小寫），第二個字當參數卡號
    const commandName = args[0].toLowerCase(); // 這樣不管後面打什麼，這裡永遠都只會拿到 "av"！
    const paramId = args.length > 1 ? args[1] : null; // 這裡會精準拿到 "#00000"

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
            id: paramId, // 🎯 關鍵：完美將分離出來的 "#00000" 參數帶入指令中！
            messageId: String(message.id), 
            user: message.author,
            author: message.author,         // 👈 補上這行，確保相容訊息格式的 .author
            mentions: message.mentions,     // 🎯 關鍵：直接把原始訊息的標記系統傳過去！
            member: message.member,
            guild: message.guild,
            client: message.client,
             channel: message.channel, 
            deferred: false,
            replied: false,
            targetUser: message.mentions.users.first() || null, // 👈 補上這行
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
            editReply: async (contentObj) => {
                mockInteraction.replied = true;
                if (mockInteraction.mainMsg) {
                    const updatePayload = {};
                    if (contentObj.content !== undefined) updatePayload.content = contentObj.content;
                    else updatePayload.content = null;
                    if (contentObj.embeds) updatePayload.embeds = contentObj.embeds;
                    if (contentObj.components) updatePayload.components = contentObj.components;
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
            await actionFunction(mockInteraction);
        } catch (error) {
            console.error(`執行快捷鍵 ${commandName} 失敗:`, error);
            if (mockInteraction.mainMsg) await mockInteraction.mainMsg.delete().catch(() => {});
            message.reply(`❌ 執行快捷指令時發生未知錯誤。`);
        }
    }
});


client.login(process.env.token);
