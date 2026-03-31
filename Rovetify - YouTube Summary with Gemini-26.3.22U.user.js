// ==UserScript==
// @name               Rovetify : YouTube Summary with Gemini
// @name:zh-CN         Rovetify : YouTube视频Gemini总结
// @name:zh-TW         Rovetify : YouTube影片Gemini總結
// @name:ja            Rovetify : YouTube Gemini 動画要約
// @description        Summarize YouTube videos with Google Gemini. Ask Gemini about the video, enjoy bilingual synced subtitles, and export transcripts. Features a native YouTube-style UI.
// @description:zh-CN  使用 Google Gemini 总结 YouTube 视频内容，支持向 Gemini 提问视频内容，支持双语同步字幕并导出，YouTube 同款原生 UI。
// @description:zh-TW  使用 Google Gemini 總結 YouTube 影片內容，支援向 Gemini 提問影片內容，提供雙語同步字幕與匯出功能，採用 YouTube 同款原生 UI。
// @description:ja     Google Gemini を使用して YouTube 動画を要約します。動画の内容に関する質問、2か国語同期字幕の表示と書き出しに対応。YouTube 純正風の UI デザイン。
// @namespace
// @homepageURL       https://github.com/Rove24/Rovetify
// @source
// @supportURL        https://github.com/Rove24/Rovetify/issues
// @version           26.3.22U
// @author            Rove24
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      youtube.com
// @connect      googlevideo.com
// @connect      generativelanguage.googleapis.com
// @connect      translate.googleapis.com
// @license      MIT
// @run-at       document-start
// ==/UserScript==

const capturedSubtitles = new Map();

(function hijackNetwork() {
    // 1. 劫持 XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._interceptedUrl = typeof url === 'string' ? url : (url?.href || '');
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (this._interceptedUrl && this._interceptedUrl.includes('/api/timedtext')) {
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    let videoId = urlParams.get('v');
                    if (!videoId) {
                        const match = window.location.pathname.match(/\/(?:watch|shorts)\/([a-zA-Z0-9_-]+)/);
                        if (match) videoId = match[1];
                    }
                    if (videoId) {
                        capturedSubtitles.set(videoId, this.responseText);
                        console.log(`[Gemini Summarizer] 成功从底层 XHR 拦截到原生字幕！(${videoId})`);
                    }
                } catch (e) {}
            }
        });
        return originalSend.apply(this, arguments);
    };

    // 2. 劫持 Fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            if (url && url.includes('/api/timedtext')) {
                const clonedRes = response.clone();
                clonedRes.text().then(text => {
                    const urlParams = new URLSearchParams(new URL(url).search);
                    let videoId = urlParams.get('v');
                    if (!videoId) {
                        const vMatch = window.location.search.match(/[?&]v=([^&]+)/);
                        if(vMatch) videoId = vMatch[1];
                    }
                    if (videoId) {
                        capturedSubtitles.set(videoId, text);
                        console.log(`[Gemini Summarizer] 成功从底层 Fetch 拦截到原生字幕！(${videoId})`);
                    }
                }).catch(e => {});
            }
        } catch (e) {}
        return response;
    };
})();

(function () {
    'use strict';

    // ==================== 配置管理与多语言 (i18n) ====================
    const CONFIG = {
        API_KEY_STORAGE: 'gemini_api_key',
        MODEL_STORAGE: 'gemini_model_rove',
        PROMPT_STORAGE: 'gemini_prompt_rove',
        THEME_STORAGE: 'gemini_ui_theme_rove',
        LANG_STORAGE: 'gemini_ui_lang_rove',

    };

    // 全局多语言字典库
    const I18N = {
        'zh-CN': {
            btn_ai: 'AI总结', title: 'Gemini 视频总结', tab_sum: '视频总结', tab_trans: '转录字幕', bubble_copy_tip: '复制内容', bubble_copied: '已复制',
            btn_copy: '复制总结', btn_set: '设置', btn_trans: '翻译字幕', btn_sync: '与视频时间同步',
            tip_refresh: '重新总结', tip_lang: 'EN/文', tip_close: '隐藏', tip_theme: '切换主题',
            set_return: '返回总结', set_model: 'Gemini 模型版本', set_key: 'Gemini API Key', set_key_ph: '输入您的 API Key',
            set_prompt: 'Gemini 提示词', set_prompt_ph: '输入您的Gemini提示词', set_save: '保存 Gemini 模型设置',
            help_title: '使用帮助：', help_1: '1. 进入 ', help_link_1: 'Google AI Studio',
            help_2: '2. 创建API密钥', help_3: '3. 复制密钥并粘贴', help_4: '4. 选择模型保存后刷新网页即可体验',
            help_5: '具体额度使用情况访问 ', help_link_2: '速率限制', set_sponsor: '☕ 赞助开发者 / 支持项目',
            msg_save_ok: '设置已成功保存！', msg_key_err: '请输入有效的 API Key', msg_reload: '切换语言需要刷新页面以应用新的AI提示词，是否立即刷新？',
            msg_cd: '请过{s}秒后再试', empty_sum: '暂无总结内容，请点击下方 "AI总结" 按钮。',
            btn_translating: '正在翻译...', btn_trans_cancel: '取消翻译', msg_loading: '正在分析视频并生成总结...',
            chat_ph: '向 Gemini 提问...', chat_title: 'Gemini 视频助教', chat_default_q: '你怎么看这个视频', chat_send: '提交', chat_err: '⚠️ 回答出错：', error_api_key: '💡 提示：请检查您的 API Key 是否正确，或点击下方"设置"按钮重新配置。', error_quota: '💡 提示：您的 API 请求次数可能已达上限，或该模型暂不支持。请在"设置"中切换模型版本后重试。',
            chat_thinking: '正在思考...', chat_key_err: '⚠️ 请先在设置中填写 API Key', chat_no_context: '视频可能没有字幕，且 AI 总结仍在生成中，请稍等几秒后再提问。',
            chat_clear_tip: '清空对话内容', chat_clear_confirm: '确定要清空当前的对话内容吗？', chat_prompt_prefix: '以下是视频的文本内容：\n\n', chat_prompt_suffix: '请根据以上视频内容，用简练专业的语言回答我的问题：',
            search_ph: '搜索转录字幕内容...', search_btn: '搜索字幕...', btn_export: '导出字幕', btn_exported: '✓ 已导出',
            transcript_loading: '正在读取视频原生字幕...', transcript_tip: '💡 提示：如果一直加载，请在播放器右下角手动点击「CC」按钮开启字幕', transcript_error: '获取字幕出错',
            thinking_start: 'Gemini开始深度思考', thinking_timer: 'Gemini 已思考{m}分{s}秒，请稍等',
            prompt_add_tip: '新增提示词', prompt_rename_tip: '重命名当前配置', prompt_del_tip: '删除当前配置', prompt_del_error: '⚠️ 默认提示词不可删除！您可以直接修改它的内容。', error_title: '⚠️ 出现问题', export_title: '视频标题: ', export_link: '视频链接: ',
            prompt_name_ph: '请输入新配置的名称 (如: 娱乐模式)：', prompt_new_default: '新提示词', prompt_rename_ph: '重命名该配置：', prompt_default_name: '默认', prompt_del_confirm: '确定要删除当前选中的提示词配置吗？',
            prompt: `请你作为一位专业的视频内容分析助手，根据提供的视频内容，生成结构化的总结报告。请严格按照以下两部分格式输出：\n\n### 视频总结\n根据视频的内容篇幅长短，请用一段连贯的文字（150-300字或350-600字之间）高度概括视频的核心主旨。\n要求：直接切入主题，客观总结视频的主要论点、关键问题以及最终的建议或结论。拒绝车轱辘话，语言必须精炼、专业。\n### 内容要点\n根据视频的信息密度，内容篇幅长短，动态提取7到66个最重要的分论点、核心见解或关键信息转折点，每个点之间的最小间隔不得小于总篇幅5%或者1分钟，按照内容发生的先后顺序输出。\n格式严格要求如下（用无序列表）：\n- [大致时间点] 1. 一句话简要概括该段内容（不超过15个字，精准提炼）\n- [大致时间点] 2. 一句话简要概括该段内容（不超过15个字，精准提炼）`
        },
        'zh-TW': {
            btn_ai: 'AI總結', title: 'Gemini 影片總結', tab_sum: '影片總結', tab_trans: '轉錄字幕', bubble_copy_tip: '複製內容', bubble_copied: '已複製',
            btn_copy: '複製總結', btn_set: '設定', btn_trans: '翻譯字幕', btn_sync: '與影片時間同步',
            tip_refresh: '重新總結', tip_lang: 'EN/文', tip_close: '隱藏', tip_theme: '切換主題',
            set_return: '返回總結', set_model: 'Gemini 模型版本', set_key: 'Gemini API Key', set_key_ph: '輸入您的 API Key',
            set_prompt: 'Gemini 提示詞', set_prompt_ph: '輸入您的Gemini提示詞', set_save: '儲存 Gemini 模型設定',
            help_title: '使用說明：', help_1: '1. 進入 ', help_link_1: 'Google AI Studio',
            help_2: '2. 建立API金鑰', help_3: '3. 複製金鑰並貼上', help_4: '4. 選擇模型儲存後重新整理網頁即可',
            help_5: '具體額度使用情況存取 ', help_link_2: '速率限制', set_sponsor: '☕ 贊助開發者 / 支持項目',
            msg_save_ok: '設定已成功儲存！', msg_key_err: '請輸入有效的 API Key', msg_reload: '切換語言需要重整頁面以應用新的AI提示詞，是否立即重整？',
            msg_cd: '請過{s}秒後再試', empty_sum: '暫無總結內容，請點擊下方 "AI總結" 按鈕。',
            btn_translating: '正在翻譯...', btn_trans_cancel: '取消翻譯', msg_loading: '正在分析影片並生成總結...',
            chat_ph: '向 Gemini 提問...', chat_title: 'Gemini 影片助教', chat_default_q: '你怎麼看這個影片', chat_send: '送出', chat_err: '⚠️ 回答出錯：', error_api_key: '💡 提示：請檢查您的 API Key 是否正確，或點擊下方"設定"按鈕重新配置。', error_quota: '💡 提示：您的 API 請求次數可能已達上限，或該模型暫不支援。請在"設定"中切換模型版本後重試。',
            chat_thinking: '正在思考...', chat_key_err: '⚠️ 請先在設定中填寫 API Key', chat_no_context: '影片可能沒有字幕，且 AI 總結仍在生成中，請稍等幾秒後再提問。',
            chat_clear_tip: '清空對話內容', chat_clear_confirm: '確定要清空目前的對話內容嗎？', chat_prompt_prefix: '以下是影片的文字內容：\n\n', chat_prompt_suffix: '請根據以上影片內容，用簡練專業的語言回答我的問題：',
            search_ph: '搜尋轉錄字幕內容...', search_btn: '搜尋字幕...', btn_export: '匯出字幕', btn_exported: '✓ 已匯出',
            transcript_loading: '正在讀取影片原生字幕...', transcript_tip: '💡 提示：如果一直加載，請在播放器右下角手動點擊「CC」按鈕開啟字幕', transcript_error: '取得字幕失敗',
            thinking_start: 'Gemini開始深度思考', thinking_timer: 'Gemini 已思考{m}分{s}秒，請稍等',
            prompt_add_tip: '新增提示詞', prompt_rename_tip: '重新命名當前配置', prompt_del_tip: '刪除當前配置', prompt_del_error: '⚠️ 預設提示詞不可刪除！您可以直接修改它的內容。', error_title: '⚠️ 發生問題', export_title: '影片標題: ', export_link: '影片連結: ',
            prompt_name_ph: '請輸入新配置的名稱 (如: 娛樂模式)：', prompt_new_default: '新提示詞', prompt_rename_ph: '重新命名該配置：', prompt_default_name: '預設', prompt_del_confirm: '確定要刪除目前選中的提示詞配置嗎？',
            prompt: `請你作為一位專業的影片內容分析助手，根據提供的影片內容，生成結構化的總結報告。請嚴格按照以下兩部分格式輸出：\n\n### 影片總結\n根據影片的內容篇幅長短，請用一段連貫的文字（150-300字或350-600字之間）高度概括影片的核心主旨。\n要求：直接切入主題，客觀總結影片的主要論點、關鍵問題以及最終的建議或結論。拒絕廢話，語言必須精煉、專業。\n### 內容要點\n根據影片的資訊密度，內容篇幅長短，動態提取7到66個最重要的分論點、核心見解或關鍵資訊轉折點，每個點之間的最小間隔不得小於總篇幅5%或者1分鐘，按照內容發生的先後順序輸出。\n格式嚴格要求如下（用無序列表）：\n- [大致時間點] 1. 一句話簡要概括該段內容（不超過15個字，精準提煉）\n- [大致時間點] 2. 一句話簡要概括該段內容（不超過15個字，精準提炼）`
        },
        'en': {
            btn_ai: 'AI Summary', title: 'Gemini Summary', tab_sum: 'Summary', tab_trans: 'Transcript', bubble_copy_tip: 'Copy content', bubble_copied: 'Copied!',
            btn_copy: 'Copy Summary', btn_set: 'Settings', btn_trans: 'Translate', btn_sync: 'Sync Video',
            tip_refresh: 'Resummarize', tip_lang: 'EN/文', tip_close: 'Hide', tip_theme: 'Theme',
            set_return: 'Back', set_model: 'Model Version', set_key: 'API Key', set_key_ph: 'Enter your API Key',
            set_prompt: 'Gemini Prompt', set_prompt_ph: 'Enter your custom prompt', set_save: 'Save Settings',
            help_title: 'Help: ', help_1: '1. Go to ', help_link_1: 'Google AI Studio',
            help_2: '2. Create API key', help_3: '3. Paste it here', help_4: '4. Save and refresh page',
            help_5: 'Check usage at ', help_link_2: 'Rate Limits', set_sponsor: '☕ Sponsor the Developer / Support Project',
            msg_save_ok: 'Settings saved successfully!', msg_key_err: 'Please enter a valid API Key', msg_reload: 'Reload to apply new prompt?',
            msg_cd: 'Wait {s}s before retry.', empty_sum: 'No summary. Click "AI Summary".',
            btn_translating: 'Translating...', btn_trans_cancel: 'Cancel', msg_loading: 'Analyzing video...',
            chat_ph: 'Ask Gemini...', chat_title: 'Gemini Video Assistant', chat_default_q: 'What do you think about this video?', chat_send: 'Send', chat_err: '⚠️ Chat Error: ', error_api_key: '💡 Tip: Please check your API Key, or click "Settings" below to reconfigure.', error_quota: '💡 Tip: API limit reached or model not supported. Switch models in "Settings" and try again.',
            chat_thinking: 'Thinking...', chat_key_err: '⚠️ Please set API Key in settings first', chat_no_context: 'No subtitles found or summary is still generating. Please wait.',
            chat_clear_tip: 'Clear conversation', chat_clear_confirm: 'Clear all chat messages?', chat_prompt_prefix: 'Here is the transcript of the video:\n\n', chat_prompt_suffix: 'Please answer my question based on the above video content in concise and professional language:',
            search_ph: 'Search transcript...', search_btn: 'Search...', btn_export: 'Export', btn_exported: '✓ Exported',
            transcript_loading: 'Fetching native subtitles...', transcript_tip: '💡 Tip: If it keeps loading, please turn on "CC" in the player.', transcript_error: 'Failed to load subtitles',
            thinking_start: 'Gemini started deep thinking', thinking_timer: 'Gemini has thought for {m}m{s}s, please wait',
            prompt_add_tip: 'Add new prompt', prompt_rename_tip: 'Rename config', prompt_del_tip: 'Delete config', prompt_del_error: '⚠️ The default prompt cannot be deleted! You can edit it directly.', error_title: '⚠️ An error occurred', export_title: 'Video Title: ', export_link: 'Video Link: ',
            prompt_name_ph: 'Enter config name:', prompt_new_default: 'New Prompt', prompt_rename_ph: 'Rename to:', prompt_default_name: 'Default', prompt_del_confirm: 'Delete this prompt config?',
            prompt: `As a professional video content analysis assistant, please generate a structured summary report based on the provided video content. Strictly follow the two-part format below:\n\n### Video Summary\nDepending on the length of the video, provide a coherent paragraph (150-300 words or 350-600 words) that highly summarizes the core theme of the video.\nRequirements: Get straight to the point, objectively summarize the main arguments, key issues, and final recommendations or conclusions. Avoid repetitive fluff; the language must be concise and professional.\n### Key Points\nBased on the information density and length of the video, dynamically extract 7 to 66 of the most important sub-arguments, core insights, or key information turning points. The minimum interval between each point must not be less than 5% of the total length or 1 minute, output in chronological order.\nStrict formatting requirements (use an unordered list):\n- [Approximate time] 1. Briefly summarize this section in one sentence (under 15 words, accurately extracted)\n- [Approximate time] 2. Briefly summarize this section in one sentence (under 15 words, accurately extracted)`
        },
        'ja': {
            btn_ai: 'AI要約', title: 'Gemini 動画要約', tab_sum: '動画要約', tab_trans: '文字起こし', bubble_copy_tip: '内容をコピー', bubble_copied: 'コピーしました',
            btn_copy: 'コピー', btn_set: '設定', btn_trans: '翻訳する', btn_sync: '動画と同期',
            tip_refresh: '再要約', tip_lang: 'EN/文', tip_close: '隠す', tip_theme: 'テーマ',
            set_return: '戻る', set_model: 'Gemini モデル', set_key: 'Gemini API キー', set_key_ph: 'APIキーを入力してください',
            set_prompt: 'Gemini プロンプト', set_prompt_ph: 'プロンプトを入力してください', set_save: '設定を保存',
            help_title: 'ヘルプ: ', help_1: '1. ', help_link_1: 'Google AI Studio へ',
            help_2: '2. APIキーを作成', help_3: '3. ここに貼り付け', help_4: '4. 保存してページを更新',
            help_5: '利用状況は ', help_link_2: 'API 制限 で確認', set_sponsor: '☕ 開発者を支援 / プロジェクトをサポート',
            msg_save_ok: '設定を保存しました！', msg_key_err: '有効なAPIキーを入力してください', msg_reload: '再読み込みして適用しますか？',
            msg_cd: '{s}秒後に再試行してください', empty_sum: '要約がありません。「AI要約」をクリック。',
            btn_translating: '翻訳中...', btn_trans_cancel: 'キャンセル', msg_loading: '動画を分析中...',
            chat_ph: 'Geminiに質問...', chat_title: 'Gemini 動画アシスタント', chat_default_q: 'この動画についてどう思いますか？', chat_send: '送信', chat_err: '⚠️ エラー: ', error_api_key: '💡 ヒント：APIキーが正しいか確認するか、下の「設定」で再設定してください。', error_quota: '💡 ヒント：APIの制限に達したか、モデルが非対応です。「設定」でモデルを変更してください。',
            chat_thinking: '考え中...', chat_key_err: '⚠️ 設定でAPIキーを入力してください', chat_no_context: '字幕がないか、要約を作成中です。少々お待ちください。',
            chat_clear_tip: '会話をクリア', chat_clear_confirm: 'すべての会話内容を消去しますか？', chat_prompt_prefix: '以下は動画の文字起こし内容です：\n\n', chat_prompt_suffix: '上記の動画内容に基づいて、簡潔で専門的な言葉で私の質問に答えてください：',
            search_ph: '字幕を検索...', search_btn: '検索...', btn_export: '書き出し', btn_exported: '✓ 完了',
            transcript_loading: '字幕を取得中...', transcript_tip: '💡 ヒント: 読み込みが続く場合は、プレーヤーの「CC」をオンにしてください。', transcript_error: '字幕の取得に失敗しました',
            thinking_start: 'Geminiが深く考え始めました', thinking_timer: 'Geminiは{m}分{s}秒考えています。少々お待ちください',
            prompt_add_tip: 'プロンプトを追加', prompt_rename_tip: '名前を変更', prompt_del_tip: '削除', prompt_del_error: '⚠️ デフォルトのプロンプトは削除できません！直接編集してください。', error_title: '⚠️ エラーが発生しました', export_title: '動画のタイトル: ', export_link: '動画リンク: ',
            prompt_name_ph: '設定名を入力:', prompt_new_default: '新しいプロンプト', prompt_rename_ph: '新しい名前に変更:', prompt_default_name: 'デフォルト', prompt_del_confirm: 'このプロンプト設定を削除しますか？',
            prompt: `プロの動画コンテンツ分析アシスタントとして、提供された動画コンテンツに基づいて構造化された要約レポートを作成してください。以下の2つの部分の形式に厳密に従って出力してください：\n\n### 動画の要約\n動画の長さに応じて、一貫した文章（150〜300字または350〜600字）で動画の核心テーマを高度に要約してください。\n要件：単刀直入に、動画の主要な論点、重要な問題、最終的な提案や結論を客観的に要約してください。冗長な表現は避け、簡潔かつ専門的な言葉を使用してください。\n### 要点\n動画の情報密度や長さに応じて、最も重要なサブテーマ、核心的な見解、または重要な情報の轉換点を7〜66個動的に抽出します。各ポイント間の最小間隔は、全体の長さの5％または1分未満であってはならず、発生順に出力してください。\n厳密な形式要件（順序なしリストを使用）：\n- [おおよその時間] 1. このセクションの内容を1文で簡潔に要約する（15文字以内、正確に抽出）\n- [おおよ尋ねる時間] 2. このセクションの内容を1文で簡潔に要約する（15文字以内、正確に抽出）`
        }
    };

    // 获取当前系统语言包的快捷函数
    function getLang() {
        const lang = GM_getValue(CONFIG.LANG_STORAGE, 'zh-CN');
        return I18N[lang] || I18N['zh-CN'];
    }
    // --- 智能识别：优先识别 YouTube 网页真实主题 ---
    function isLightMode() {
        return !document.documentElement.hasAttribute('dark');
    }
    // 新增：判断是否为手机模式
    const isMobileMode = () => window.location.hostname === 'm.youtube.com' || window.innerWidth <= 600;

    // 新增：获取初始主题状态
    function getTargetTheme() {
        const nativeLight = isLightMode();
        if (isMobileMode()) {
            // 手机端：尝试从存储读取，如果没有存过，则跟随网页原生
            const stored = GM_getValue(CONFIG.THEME_STORAGE, null);
            return stored === null ? nativeLight : (stored === 'light');
        }
        // 电脑端：永远只看网页原生的
        return nativeLight;
    }

    const summaryCache = new Map();
    let isRequesting = false;
    let loadingTimerInterval = null;

  //  function getApiKey() {
  //      return GM_getValue(CONFIG.API_KEY_STORAGE, '');
  //  }
    function getRawApiKeys() {
    return GM_getValue(CONFIG.API_KEY_STORAGE, '');
   }

    function getApiKeyList() {
    const raw = getRawApiKeys();
    return raw.split('\n')
              .map(key => key.trim())
              .filter(key => key.length > 0);
    }

    function saveApiKey(key) {
        GM_setValue(CONFIG.API_KEY_STORAGE, key);
    }

    // ==================== 样式注入 ====================
    const styles = `

        /* ===== 深色模式（默认）===== */
        .gemini-sidebar {
            --gs-bg-main: #272727;
            --gs-bg-input: #2a2a2a;
            --gs-bg-search: #121212;
            --gs-bg-hover: rgba(255, 255, 255, 0.1);
            --gs-bg-hover-strong: rgba(255, 255, 255, 0.2);
            --gs-bg-info: rgba(255, 255, 255, 0.05);
            --gs-bg-icon: rgba(255, 255, 255, 0.08);
            --gs-bg-bubble-ai: rgba(255, 255, 255, 0.12);
            --gs-bg-bubble-user: #333333;
            --gs-bg-copy-btn: #212121;
            --gs-bg-active-line: rgba(255, 255, 255, 0.15);
            --gs-text-main: #f1f1f1;
            --gs-text-secondary: #e0e0e0;
            --gs-text-muted: #aaaaaa;
            --gs-text-info: #b0b0b0;
            --gs-border: var(--gs-bg-hover);
            --gs-border-input: #444;
            --gs-border-search: #303030;
            --gs-border-compact: #333;
            --gs-tab-active-bg: #f1f1f1;
            --gs-tab-active-text: #0f0f0f;
            --gs-scrollbar: rgba(255, 255, 255, 0.15);
            --gs-scrollbar-hover: rgba(255, 255, 255, 0.3);
            --gs-shadow: rgba(0, 0, 0, 0.5);
        }

        /* Multi-API Textarea Style */
        .gemini-settings-textarea {
            width: 100%;
            height: 100px;
            padding: 10px;
            background: var(--gs-bg-input);
            border: 1px solid var(--gs-border-input);
            border-radius: 6px;
            color: var(--gs-text-main);
            font-size: 12px;
            font-family: monospace;
            resize: vertical;
            box-sizing: border-box;
            margin-bottom: 15px;
            outline: none;
        }
        .gemini-settings-textarea:focus {
            border-color: var(--gs-text-main);
        }

        /* ===== 浅色模式（.light-theme 触发）===== */
        .gemini-sidebar.light-theme {
            --gs-bg-main: #ffffff;
            --gs-bg-input: #f5f5f5;
            --gs-bg-search: #f0f0f0;
            --gs-bg-hover: rgba(0, 0, 0, 0.06);
            --gs-bg-hover-strong: rgba(0, 0, 0, 0.12);
            --gs-bg-info: rgba(0, 0, 0, 0.03);
            --gs-bg-icon: rgba(0, 0, 0, 0.06);
            --gs-bg-bubble-ai: rgba(0, 0, 0, 0.06);
            --gs-bg-bubble-user: #e8e8e8;
            --gs-bg-copy-btn: #eeeeee;
            --gs-bg-active-line: rgba(0, 0, 0, 0.08);
            --gs-text-main: #0f0f0f;
            --gs-text-secondary: #1a1a1a;
            --gs-text-muted: #606060;
            --gs-text-info: #717171;
            --gs-border: rgba(0, 0, 0, 0.1);
            --gs-border-input: #cccccc;
            --gs-border-search: #e0e0e0;
            --gs-border-compact: #d0d0d0;
            --gs-tab-active-bg: #0f0f0f;
            --gs-tab-active-text: #ffffff;
            --gs-scrollbar: rgba(0, 0, 0, 0.15);
            --gs-scrollbar-hover: rgba(0, 0, 0, 0.3);
            --gs-shadow: rgba(0, 0, 0, 0.15);
        }

        .gemini-summarizer-btn {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 0 16px;
            height: 36px;
            margin-right: 8px;
            margin-left: 8px;
            background-color: rgba(255, 255, 255, 0.1);
            color: #f1f1f1;
            border: none;
            border-radius: 18px;
            font-family: "Roboto", "Arial", sans-serif;
            font-size: 14px;
            font-weight: 500;
            line-height: normal;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }
        .gemini-summarizer-btn:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
        .gemini-summarizer-btn:active {
            transform: translateY(0);
        }
        .gemini-summarizer-btn svg {
            width: 20px;
            height: 20px;
            margin-left: -4px;
        }
        /* --- 新增：AI总结按钮的浅色模式 --- */
        .gemini-summarizer-btn.light-mode {
            background-color: #f1f1f1;
            color: #0f0f0f;
        }
        .gemini-summarizer-btn.light-mode:hover {
            background-color: #d9d9d9;
        }
        .gemini-sidebar {
            position: fixed;
            top: 6vh;
            right: -440px;
            width: 420px;
            height: 93.75vh;
            background: var(--gs-bg-main);
            box-shadow: -2px 4px 15px rgba(0, 0, 0, 0.5);
            border-radius: 12px;
            border: 1px solid var(--gs-border);
            transition: right 0.3s ease;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            font-family: 'Roboto', Arial, sans-serif;
            overscroll-behavior: none;
            overflow-x: hidden;
        }
        .gemini-sidebar.active {
            right: 4px;
        }
        .gemini-sidebar-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            background: transparent;
            border-bottom: 1px solid var(--gs-border);
            color: var(--gs-text-main);
        }
        .gemini-sidebar-title {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        /* --- 调优折叠按钮尺寸与位置 --- */
        .gemini-close-btn {
            background: var(--gs-bg-hover);
            border: none;
            color: var(--gs-text-main);
            width: 38px;
            height: 38px;
            font-size: 22px;
            font-family: monospace;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
            position: relative;
            top: -2px;
            right: -4px;
        }
        .gemini-close-btn:hover {
            background: var(--gs-bg-hover-strong);
        }
        .gemini-sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            color: var(--gs-text-secondary);
            font-size: 15px;
        }
        .gemini-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 20px;
            font-size: 15px;
        }
        .gemini-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--gs-bg-hover);
            border-top-color: var(--gs-text-main);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .gemini-summary {
            line-height: 1.6;
        }
        .gemini-summary h3 {
            color: var(--gs-text-main);
            margin: 20px 0 10px 0;
            font-size: 18px;
            font-weight: 600;
        }
        .gemini-summary h3:first-child {
            margin-top: 0;
        }
        .gemini-summary p {
            margin: 10px 0;
        }
        .gemini-summary ul {
            padding-left: 20px;
            margin: 10px 0;
        }
        .gemini-summary li {
            margin: 8px 0;
        }
        .gemini-actions {
            padding: 10px 20px;
            border-top: 1px solid var(--gs-border);
            display: flex;
            gap: 12px;
            position: relative;
            z-index: 1001;
            background: var(--gs-bg-main);
        }
        .gemini-action-btn {
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 18px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .gemini-copy-btn {
            background: #e5e5e5;
            color: #0f0f0f;
        }
        .gemini-copy-btn:hover {
            background: #d0d0d0;
        }
        .gemini-settings-btn {
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
        }
        .gemini-settings-btn:hover {
            background: var(--gs-bg-hover-strong);
        }
        .gemini-error {
            padding: 16px;
            background-color: rgba(255, 78, 69, 0.1);
            border: 1px solid rgba(255, 78, 69, 0.2);
            border-left: 4px solid #ff4e45;
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.5;
        }
        .gemini-error strong {
            display: block;
            color: #ff4e45;
            font-size: 15px;
            margin-bottom: 10px;
        }
        .gemini-error-msg {
            color: var(--gs-text-muted);
            word-break: break-word;
            font-family: monospace;
            background-color: rgba(0, 0, 0, 0.25);
            padding: 10px;
            border-radius: 6px;
        }
        .gemini-error-tip {
            color: var(--gs-text-main);
            font-size: 13px;
            margin-top: 10px;
        }
        .gemini-settings {
            padding: 0px;
            padding-bottom: 20px;
        }
        .gemini-settings label {
            display: block;
            margin-bottom: 8px;
            color: var(--gs-text-secondary);
            font-size: 14px;
        }
        .gemini-settings input {
            width: 100%;
            padding: 10px;
            background: var(--gs-bg-input);
            border: 1px solid var(--gs-border-input);
            border-radius: 6px;
            color: var(--gs-text-main);
            font-size: 14px;
            margin-bottom: 15px;
            outline: none;
            box-sizing: border-box;
        }
        .gemini-settings input:focus {
            border-color: var(--gs-text-main);
        }
        /* --- 提示词多行文本框样式 --- */
        .gemini-settings textarea {
            width: 100%;
            padding: 10px;
            background: var(--gs-bg-input);
            border: 1px solid var(--gs-border-input);
            border-radius: 6px;
            color: var(--gs-text-main);
            font-size: 13px;
            margin-bottom: 15px;
            outline: none;
            resize: vertical;
            min-height: 150px;
            font-family: inherit;
            line-height: 1.5;
            box-sizing: border-box;
        }
        .gemini-settings textarea:focus {
            border-color: var(--gs-text-main);
        }
        .gemini-settings-save {
            width: 100%;
            box-sizing:
            border-box;
            padding: 12px;
            background: var(--gs-tab-active-bg);
            color: var(--gs-tab-active-text);
            border: none;
            border-radius: 18px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        .gemini-settings-save:hover {
            opacity: 0.85;
        }
        .gemini-settings-info {
            margin-top: 15px;
            box-sizing:
            border-box;
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--gs-border);
            border-radius: 6px;
            font-size: 12px;
            color: var(--gs-text-info);
        }
        .gemini-settings-info a {
            color: #3ea6ff;
            text-decoration: none;
        }
        .gemini-settings-info a:hover {
            text-decoration: underline;
        }

        /* --- 赞助链接按钮样式 --- */
        .gemini-sponsor-link {
            display: block;
            margin-top: 15px;
            padding: 10px;
            background-color: var(--gs-bg-hover);
            border: 1px solid var(--gs-border);
            border-radius: 8px;
            text-align: center;
            color: var(--gs-text-main) !important;
            font-weight: bold;
            text-decoration: none !important;
            transition: all 0.2s ease;
        }
        .gemini-sponsor-link:hover {
            background-color: var(--gs-bg-hover-strong);
            transform: translateY(-1px);
            border-color: #3ea6ff; /* 悬浮时给个科技蓝边框 */
        }

        /* --- 设置界面下拉框及返回按钮样式 --- */
        .gemini-settings select {
            width: 100%;
            padding: 10px;
            background: var(--gs-bg-input);
            border: 1px solid var(--gs-border-input);
            border-radius: 6px;
            color: var(--gs-text-main);
            font-size: 14px;
            margin-bottom: 20px;
            cursor: pointer;
            outline: none;
            appearance: auto;
            box-sizing: border-box;
        }
        .gemini-settings select:focus {
            border-color: var(--gs-text-main);
        }
        .gemini-return-btn {
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
            border: none;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            padding: 8px 18px 8px 12px;
            margin-bottom: 20px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
        }
        .gemini-return-btn:hover {
            background: var(--gs-bg-hover-strong);
            text-decoration: none;
        }
        /* --- YouTube 原生章节风格 --- */
        .gemini-summary ul {
            list-style: none !important;
            padding: 0;
            margin: 10px 0;
            display: flex;
            flex-direction: column;
        }
        .gemini-chapter-item {
            display: flex;
            align-items: baseline;
            padding: 8px 12px;
            margin: 2px 0;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            border-left: 3px solid transparent;
        }
        .gemini-chapter-item:hover {
            background: var(--gs-bg-hover);
        }
        .gemini-time-text {
            background-color: rgba(62, 166, 255, 0.15);
            color: #3ea6ff;
            font-family: "Roboto", Arial, sans-serif;
            font-size: 13px;
            font-weight: 500;
            padding: 2px 6px;
            border-radius: 4px;
            margin-right: 12px;
            flex-shrink: 0;
            margin-top: 0;
            line-height: 1;
        }
        .gemini-chapter-text {
            color: var(--gs-text-main);
            font-size: 14px;
            line-height: 1.4;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        .gemini-chapter-text div:first-child {
            line-height: 1.4;
            margin-top: 0;
        }
        /* 专属的译文字幕样式 */
        .gemini-trans-text {
            color: var(--gs-text-muted);
            font-size: 13px;
            margin-top: 6px;
            border-left: 2px solid var(--gs-scrollbar);
            padding-left: 10px;
            line-height: 1.3;
        }
        /* --- 顶部右侧图标按钮组 --- */
        .gemini-tab-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: auto;
        }
        .gemini-icon-btn {
            background: transparent;
            color: var(--gs-text-muted);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            position: relative;
        }
        .gemini-icon-btn:hover {
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
        }
        .gemini-icon-btn:active {
            transform: scale(0.85);
            color: #3ea6ff;
        }
        /* 将原生下拉框设为完全透明 */
        .gemini-ui-lang-select {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            opacity: 0;
            cursor: pointer;
        }
        .gemini-ui-lang-select option {
            background-color: var(--gs-bg-main);
            color: var(--gs-text-main);
        }
       /* --- 双 Tab 切换样式 --- */
        .gemini-tabs {
            display: flex;
            padding: 8px 20px 8px 20px; /* 上、右、下、左 */
            gap: 8px;
            border-bottom: 1px solid var(--gs-border);
        }
        .gemini-tab {
            padding: 0 20px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border-radius: 10px;
            transition: background-color 0.2s ease;
            line-height: 1;
        }
        .gemini-tab:hover {
            background: var(--gs-bg-hover-strong);
        }
        .gemini-tab.active {
            background-color: var(--gs-tab-active-bg);
            color: var(--gs-tab-active-text);
        }
        .gemini-tab-content {
            display: none;
            flex: 1;
            overflow-y: auto;
            color: var(--gs-text-secondary);
            font-size: 15px;
            overscroll-behavior: contain;
        }

        /* 让字幕内容保持间距 */
        #gemini-transcript-list {
            padding: 20px;
        }
        /* 间距给到专门的列表容器 */
        #gemini-transcript-list {
            padding: 20px;
        }
        .gemini-tab-content.active {
            display: block;
        }
        /* 给总结面板加回内边距，解决文字贴边问题 */
        #gemini-summary-content {
            padding: 20px;
        }

        /* ================= 底部操作栏与悬浮搜索专属样式 ================= */
        .gemini-actions {
            padding: 10px 20px;
            border-top: 1px solid var(--gs-border);
            display: flex;
            gap: 12px;
            position: relative;
            z-index: 1001;
            background: var(--gs-bg-main);
        }

        .gemini-action-btn {
            height: 36px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
        }

        /* 原有的两个按钮 */
        .gemini-copy-btn {
            flex: 1.5;
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
        }
        .gemini-copy-btn:hover { background: var(--gs-bg-hover-strong); }
        .gemini-settings-btn { flex: 1; background: var(--gs-bg-hover); color: var(--gs-text-main); }
        .gemini-settings-btn:hover { background: var(--gs-bg-hover-strong); }

        /* --- 1. 紧凑型搜索入口 (左下角) --- */
        .gemini-compact-search-btn {
            flex: 1.6;
            display: flex;
            align-items: center;
            background: var(--gs-bg-search);
            border: 1px solid var(--gs-border-compact);
            border-radius: 18px;
            cursor: pointer;
            padding: 0;
            overflow: hidden;
            transition: border-color 0.2s;
            height: 36px;
        }
        .gemini-compact-search-btn:hover { border-color: #555; }
        .gemini-compact-search-text {
            flex: 1;
            color: #888;
            font-size: 13px;
            padding-left: 10px;
            text-align: left;
            pointer-events: none;
        }
        .gemini-compact-search-icon {
            width: 32px;
            height: 100%;
            background: var(--gs-bg-icon);
            border-left: 1px solid var(--gs-border-compact);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--gs-text-main);
            pointer-events: none;
        }

        /* --- 2. 底部其他组件宽度分配 --- */
        .gemini-action-btn.export-btn { flex: 0.8; background: var(--gs-bg-hover); color: var(--gs-text-main); }
        .gemini-translate-btn { flex: 1; background: #3ea6ff; color: #ffffff; }
        .gemini-action-btn.export-btn:hover {
            background: var(--gs-bg-hover-strong);
        }
        .gemini-translate-btn:hover {
            background: #2b82d9;
        }
        .gemini-lang-select {
            flex: 0.8;
            height: 36px;
            min-width: 0;
            padding: 0 18px 0 8px;
            background: var(--gs-bg-hover);
            background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23f1f1f1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 4px center;
            appearance: none;
            -webkit-appearance: none;
            color: var(--gs-text-main);
            border: none;
            border-radius: 18px;
            font-size: 13px;
            cursor: pointer;
            outline: none;
            text-align: center;
        }
        .gemini-lang-select:focus { border-color: var(--gs-text-main); }
        .gemini-lang-select:hover {
            background: var(--gs-bg-hover-strong);
        }
        .gemini-translate-btn.cancel {
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
        }
        .gemini-translate-btn.cancel:hover {
            background: var(--gs-bg-hover-strong);
        }
        .gemini-lang-select option {
            background-color: var(--gs-bg-main);
            color: var(--gs-text-main);
        }

        /* ======= 底部悬浮输入层 (搜索与提问)======== */
        .gemini-search-overlay, .gemini-chat-input-overlay {
            position: absolute;
            bottom: 0; left: 0; /* 👈 关键：贴底 */
            width: 100%;
            min-height: 100%; height: auto; /* 👈 关键：允许向上长高 */
            background: var(--gs-bg-main);
            display: flex; align-items: flex-end; /* 内部元素统底边对齐 */
            padding: 10px 20px; /* 匹配底栏的 padding */
            box-sizing: border-box;
            z-index: 1002; /* 👈 层级最高 */
            transform: translateX(100%);
            visibility: hidden; pointer-events: none;
            transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), visibility 0.3s;
        }
        .gemini-search-overlay.active, .gemini-chat-input-overlay.active {
            transform: translateX(0);
            visibility: visible; pointer-events: auto;
        }
        /* 内部输入框容器 */
        .gemini-search-wrapper {
            display: flex;
            align-items: center;
            background: var(--gs-bg-search);
            border: 1px solid var(--gs-border-search);
            border-radius: 18px;
            width: 100%;
            min-height: 36px;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }


        .gemini-chat-input-overlay .gemini-search-wrapper {
            align-items: flex-end;
        }
.gemini-chat-clear-text,
.gemini-chat-send-btn,
.gemini-chat-fold-btn {
    height: 36px; /* 👈 与最小高度一致 */
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--gs-text-muted);
    cursor: pointer;
}
        .gemini-search-wrapper:focus-within { border-color: #3ea6ff; }
        .gemini-search-input {
            flex: 1; background: transparent; border: none; color: var(--gs-text-main);
            padding: 0 12px; outline: none; font-size: 13px; height: 36px;
        }

        .gemini-search-clear:hover, .gemini-chat-clear-text:hover { color: var(--gs-text-main); }
        .gemini-search-fold-btn, .gemini-chat-fold-btn {
            background: var(--gs-bg-icon); border: none; border-left: 1px solid var(--gs-border-search);
            border-radius: 0 18px 18px 0; /* 👈 加圆角 */
            width: 44px; height: 36px; /* 👈 高度锁死36px，解决变形 */
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            color: var(--gs-text-main); transition: background 0.2s;
        }
        .gemini-search-fold-btn:hover, .gemini-chat-fold-btn:hover { background: var(--gs-scrollbar); }
        /* ================= 视频对话(Chat)专属样式 ================= */
        /* 假输入框 (3:2比例) */
        .gemini-compact-ask-btn {
            flex: 4;
            display: flex; align-items: center; background: var(--gs-bg-search); border: 1px solid var(--gs-border-compact);
            border-radius: 18px; cursor: text; padding: 0; overflow: hidden; height: 36px;
        }
        .gemini-compact-ask-btn:hover { border-color: #555; }
        .gemini-compact-ask-text {
            flex: 1; color: #888; font-size: 13px; padding-left: 12px; text-align: left; pointer-events: none;
        }
        .gemini-compact-ask-icon {
            width: 36px; height: 100%; background: rgba(255, 255, 255, 0.08); border-left: 1px solid #333;
            display: flex; align-items: center; justify-content: center;
            color: var(--gs-text-main);
            cursor: pointer;
        }
        .gemini-copy-btn { flex: 2; }

        .gemini-chat-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--gs-text-main);
            padding: 8px 12px; /* 👈 改为 8px */
            outline: none;
            font-size: 13px;
            resize: none;
            max-height: 150px;
            font-family: inherit;
            line-height: 20px; /* 👈 改为 20px */
            height: 36px;      /* 👈 新增这一行，强制初始高度 */
            display: block;
    box-sizing: border-box;
    scrollbar-width: thin; /* 👈 强制生效定制样式 */
    scrollbar-color: var(--gs-scrollbar) transparent; /* 👈 强制生效定制样式 */
}
        .gemini-chat-input::-webkit-scrollbar { width: 4px; }
        .gemini-chat-input::-webkit-scrollbar-track { background: transparent; }
        .gemini-chat-input::-webkit-scrollbar-thumb { background: var(--gs-bg-hover-strong); border-radius: 10px; }

        /* 真输入框里的 X 清除按钮样式 */
        .gemini-search-clear, .gemini-chat-clear-text {
            background: transparent !important; border: none; color: var(--gs-text-muted); cursor: pointer;
            width: 36px; height: 36px; padding: 0; display: none; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .gemini-chat-clear-text:hover { color: var(--gs-text-main); }

        /* Gemini 3同款思考动画*/
        .gemini-pro-spinner {
            position: relative;
            width: 24px;
            height: 24px;
            display: inline-block;
            margin-right: 8px;
            vertical-align: middle;
        }
        .gemini-pro-spinner .spinner-ring,
        .gemini-pro-spinner .gemini-icon {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
        }
        .gemini-pro-spinner .spinner-ring {
            animation: spin 1s linear infinite;
        }
        .gemini-pro-spinner .gemini-icon {
            transform: scale(0.65);
        }
        /* 核心样式修复：滚动条样式也明确应用到聊天面板中 */
        .gemini-chat-content *::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        .gemini-chat-content *::-webkit-scrollbar-button {
            display: none;
        }
        .gemini-chat-content *::-webkit-scrollbar-track {
            background: transparent;
        }
        .gemini-chat-content *::-webkit-scrollbar-thumb {
            background-color: var(--gs-scrollbar);
            border-radius: 10px;
        }
        .gemini-chat-content *::-webkit-scrollbar-thumb:hover {
            background-color: var(--gs-scrollbar-hover);
        }

        .gemini-chat-send-btn {
            background: transparent; border: none; color: var(--gs-text-muted); cursor: pointer; padding: 0 12px;margin-right: 4px;
            display: flex; align-items: center; justify-content: center; transition: color 0.2s;
        }
        .gemini-chat-send-btn:hover { color: #3ea6ff; }


        /* 3. 聊天回复面板 (进一步调低高度，防止遮挡 Tab) */
        .gemini-chat-panel {
            position: absolute;
            top: 20px;
            bottom: 55px;
            left: 0; width: 100%; background: var(--gs-bg-main);
            z-index: 100;
            transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            display: flex; flex-direction: column; box-sizing: border-box;
            border-radius: 12px 12px 0 0;
        }
        .gemini-chat-panel.active { transform: translateX(0); }

        .gemini-chat-header {
            padding: 12px 20px;
            border-bottom: 1px solid var(--gs-border);
            display: flex; align-items: center; gap: 10px; color: var(--gs-text-main); font-weight: 600; font-size: 15px;
        }

        /* 清空对话按钮样式 */
        .gemini-chat-clear-btn {
            background: transparent; border: none; color: var(--gs-text-muted);
            width: 32px; height: 32px; border-radius: 50%;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; margin-left: auto;
        }
        .gemini-chat-clear-btn:hover {
            background: var(--gs-bg-hover);
            color: #ff4e45;
        }
        .gemini-close-btn {
            transition: opacity 0.2s, background 0.2s;
        }
        /* 聊天面板折叠整个侧边栏按钮 */
        .gemini-chat-close-sidebar-btn {
            background: transparent; border: none; color: var(--gs-text-muted);
            width: 35px; height: 35px; border-radius: 50%;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; font-size: 20px; font-family: monospace;
            margin-left: 10px;
        }
        .gemini-chat-close-sidebar-btn:hover {
            background: var(--gs-bg-hover);
            color: var(--gs-text-main);
        }
        .gemini-chat-back-btn {
            background: transparent; border: none; color: var(--gs-text-muted); cursor: pointer; display: flex; align-items: center; padding: 0;
        }
        .gemini-chat-back-btn:hover { color: var(--gs-text-main); }
        .gemini-chat-content {
            flex: 1; overflow-y: auto; padding: 20px; color: var(--gs-text-secondary); font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; gap: 15px;
            overscroll-behavior: contain;
        }
        /* 统一气泡容器的底部间距 */
        .gemini-chat-msg.user { text-align: right; margin-bottom: 16px; }
        .gemini-chat-msg.ai { text-align: left; margin-bottom: 16px; }

        /* 👑 用户的深灰气泡 */
        .gemini-chat-msg.user span {
            background: var(--gs-bg-bubble-user);
            color: var(--gs-text-main);
            padding: 12px 18px;
            border-radius: 20px 4px 20px 20px;
            display: inline-block;
            max-width: 85%;
            text-align: left;
            word-break: break-word;
            line-height: 1.6;
        }

        /* 🤖 AI 的半透明气泡 */
        .gemini-chat-msg.ai span {
            background: var(--gs-bg-bubble-ai);
            color: var(--gs-text-main);
            padding: 12px 18px;
            padding-top: 14px;
            border-radius: 4px 20px 20px 20px;
            display: inline-block;
            max-width: 90%;
            word-break: break-word;
            line-height: 1.6;
            position: relative;
        }

        /* 复制按钮容器 - 强制重置背景和定位 */
        .gemini-bubble-copy-btn {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 26px;
            height: 26px;
            background: var(--gs-bg-copy-btn) !important;
            border: 1px solid var(--gs-bg-hover-strong);
            border-radius: 6px;
            cursor: pointer;
            display: flex !important;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            opacity: 0;
            z-index: 99;
        }

        .gemini-chat-msg.ai span:hover .gemini-bubble-copy-btn {
            opacity: 1;
        }

        /* 用 !important 确保图标切换是物理级别的，杜绝重叠 */
        .gemini-bubble-copy-btn .copy-icon {
            display: flex !important;
            pointer-events: none;
        }
        .gemini-bubble-copy-btn .check-icon {
            display: none !important;
            color: #3ea6ff;
            font-size: 14px;
            font-weight: bold;
            pointer-events: none;
        }

        /* 复制后的状态切换 */
        .gemini-bubble-copy-btn.copied .copy-icon {
            display: none !important;
        }
        .gemini-bubble-copy-btn.copied .check-icon {
            display: flex !important;
        }

        .gemini-bubble-copy-btn:hover {
            background: var(--gs-bg-bubble-user) !important;
            border-color: var(--gs-border-input);
        }

        .gemini-bubble-copy-btn svg {
            width: 14px;
            height: 14px;
            fill: var(--gs-text-muted);
        }

        /* 优化加载动画的排版 */
        .gemini-pro-spinner {
            position: relative;
            width: 20px;
            height: 20px;
            display: inline-block;
            margin-right: 6px;
            vertical-align: -4px;
        }
        .gemini-pro-spinner .spinner-ring,
        .gemini-pro-spinner .gemini-icon {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
        }
        .gemini-pro-spinner .spinner-ring {
            animation: spin 1s linear infinite;
        }
        .gemini-pro-spinner .gemini-icon {
            transform: scale(0.65);
        }

        /* --- 当前播放行的高亮样式 --- */
        .gemini-chapter-item {
            border-left: 3px solid transparent;
        }
        .gemini-chapter-item.active-line {
            background-color: var(--gs-scrollbar);
            border-left: 3px solid #3ea6ff;
        }

        /* --- 悬浮同步按钮的样式 --- */
        .gemini-sync-btn {
            position: absolute;
            bottom: 85px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background-color: var(--gs-text-main);
            color: var(--gs-bg-main);
            border: none;
            border-radius: 18px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0;
            pointer-events: none;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .gemini-sync-btn.show {
            opacity: 1;
            pointer-events: auto;
            transform: translateX(-50%) translateY(0);
        }
        .gemini-sync-btn:hover {
            opacity: 0.85;
        }
        /* --- 悬浮滚动条美化 --- */
        .gemini-sidebar-content::-webkit-scrollbar,
        .gemini-tab-content::-webkit-scrollbar,
        .gemini-chat-content::-webkit-scrollbar,
        .gemini-settings textarea::-webkit-scrollbar,
        .gemini-sidebar *::-webkit-scrollbar {
            width: 6px; height: 6px;
        }
        .gemini-sidebar-content::-webkit-scrollbar-button,
        .gemini-tab-content::-webkit-scrollbar-button,
        .gemini-chat-content::-webkit-scrollbar-button,
        .gemini-settings textarea::-webkit-scrollbar-button,
        .gemini-sidebar *::-webkit-scrollbar-button {
            display: none;
        }
        .gemini-sidebar-content::-webkit-scrollbar-track,
        .gemini-tab-content::-webkit-scrollbar-track,
        .gemini-chat-content::-webkit-scrollbar-track,
        .gemini-settings textarea::-webkit-scrollbar-track,
        .gemini-sidebar *::-webkit-scrollbar-track {
            background: transparent;
        }
        .gemini-sidebar-content::-webkit-scrollbar-thumb,
        .gemini-tab-content::-webkit-scrollbar-thumb,
        .gemini-chat-content::-webkit-scrollbar-thumb,
        .gemini-settings textarea::-webkit-scrollbar-thumb,
        .gemini-sidebar *::-webkit-scrollbar-thumb {
            background-color: var(--gs-scrollbar);
            border-radius: 10px;
        }
        .gemini-sidebar-content::-webkit-scrollbar-thumb:hover,
        .gemini-tab-content::-webkit-scrollbar-thumb:hover,
        .gemini-chat-content::-webkit-scrollbar-thumb:hover,
        .gemini-settings textarea::-webkit-scrollbar-thumb:hover,
        .gemini-sidebar *::-webkit-scrollbar-thumb:hover {
            background-color: var(--gs-scrollbar-hover);
        }
        /* 兼容 Firefox 火狐浏览器 */
        .gemini-sidebar-content, .gemini-tab-content, .gemini-chat-content, .gemini-settings textarea {
            scrollbar-width: thin;
            scrollbar-color: var(--gs-scrollbar) transparent;
        }

        /* --- 手机端响应式与拖拽组件 --- */
        @media (max-width: 600px) {
            .gemini-sidebar {
                width: 100%;
                height: 68vh;
                top: auto;
                bottom: 0;
                left: auto;
                right: -100%;
                border-radius: 20px 20px 0 0;
                border: none;
                border-top: 1px solid var(--gs-border);
                transition: right 0.3s ease;
            }
            .gemini-sidebar.active {
                right: 0;
            }
            .gemini-drag-handle {
                display: flex;
                width: 100%;
                height: 24px;
                justify-content: center;
                align-items: center;
                cursor: grab;
                flex-shrink: 0;
                touch-action: none;
            }
            .gemini-drag-pill {
                width: 48px;
                height: 5px;
                background-color: var(--gs-scrollbar-hover);
                border-radius: 3px;
            }
            .gemini-sidebar-header {
                padding: 0 20px 8px 20px;
            }
            .gemini-tabs {
                padding: 8px 20px;
                gap: 20px !important;
            }
            .gemini-tab {
                padding: 0 12px;
                height: 32px;
                font-size: 13px;
                white-space: nowrap;
            }
            .gemini-tab-actions {
                gap: 10px !important;
            }
            .gemini-icon-btn {
                width: 38px;
                height: 38px;
            }
            .gemini-icon-btn svg {
                width: 22px;
                height: 22px;
            }
            .gemini-sidebar-title {
                font-size: 15px;
            }
            .gemini-close-btn {
                right: 0;
            }
        }
        @media (min-width: 601px) {
            .gemini-drag-handle { display: none; } 
        }
    `;

    // 注入样式
    function injectStyles() {
        if (!document.getElementById('gemini-summarizer-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'gemini-summarizer-styles';
            styleElement.textContent = styles;
            document.head.appendChild(styleElement);
        }
    }

    // ==================== UI 组件 ====================
    function createSummarizeButton() {
        const button = document.createElement('button');
        button.className = 'gemini-summarizer-btn';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.7');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 3 C12 8 16 12 21 12 C16 12 12 16 12 21 C12 16 8 12 3 12 C8 12 12 8 12 3 Z');
        svg.appendChild(path);

        const span = document.createElement('span');
        span.textContent = getLang().btn_ai;

        button.appendChild(svg);
        button.appendChild(span);

        const initialIsLight = getTargetTheme();
        if (initialIsLight) {
            button.classList.add('light-mode');
        } else {
            button.classList.remove('light-mode');
        }

        return button;
    }

    // 创建侧边栏
    function createSidebar() {

        const sidebar = document.createElement('div');
        sidebar.className = 'gemini-sidebar';

        const createSafeSvg = (pathD, size) => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', size); svg.setAttribute('height', size);
            svg.setAttribute('fill', 'currentColor');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathD);
            svg.appendChild(path);
            return svg;
        };
        const SEARCH_ICON_PATH = 'M20.87,20.17l-5.59-5.59C16.35,13.35,17,11.75,17,10c0-3.87-3.13-7-7-7s-7,3.13-7,7s3.13,7,7,7c1.75,0,3.35-0.65,4.58-1.71 l5.59,5.59L20.87,20.17z M10,16c-3.31,0-6-2.69-6-6s2.69-6,6-6s6,2.69,6,6S13.31,16,10,16z';
        const CLEAR_ICON_PATH = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
        const FOLD_ICON_PATH = 'M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z';

        // 1. 拦截点击，防止点击空白处导致视频暂停
        sidebar.addEventListener('click', (e) => e.stopPropagation());
        sidebar.addEventListener('mousedown', (e) => e.stopPropagation());
        sidebar.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

        sidebar.addEventListener('touchmove', (e) => {
            if (!e.target.closest('.gemini-tab-content') &&
                !e.target.closest('.gemini-chat-panel') &&
                !e.target.closest('.gemini-chat-input')) { // 👈 加入输入框白名单
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });

        sidebar.addEventListener('wheel', (e) => {
            if (!e.target.closest('.gemini-tab-content') &&
                !e.target.closest('.gemini-chat-panel') &&
                !e.target.closest('.gemini-chat-input')) { // 👈 加入输入框白名单
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });

        const dragHandle = document.createElement('div');
        dragHandle.className = 'gemini-drag-handle';
        const dragPill = document.createElement('div');
        dragPill.className = 'gemini-drag-pill';
        dragHandle.appendChild(dragPill);

        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        // --- 提取公共的拖拽逻辑，让鼠标和手指都能调用 ---
        const dragStart = (clientY) => {
            isDragging = true;
            startY = clientY;
            startHeight = sidebar.getBoundingClientRect().height;
            document.body.style.overflow = 'hidden';
        };

        const dragMove = (clientY) => {
            if (!isDragging) return;
            const deltaY = startY - clientY;
            let newHeight = startHeight + deltaY;
            const vh = window.innerHeight;
            let newHeightVh = (newHeight / vh) * 100;
            if (newHeightVh < 40) newHeightVh = 40;
            if (newHeightVh > 95) newHeightVh = 95;
            sidebar.style.height = `${newHeightVh}vh`;
        };

        const dragEnd = () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.overflow = '';
            }
        };

        // 1. 绑定手机触摸事件 (Touch)
        dragHandle.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientY), { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches) dragMove(e.touches[0].clientY);
        }, { passive: false });
        document.addEventListener('touchend', dragEnd);

        // 2. 绑定电脑鼠标事件 (Mouse) - 👈 解决缩放窗口后无法用鼠标拖动的问题
        dragHandle.addEventListener('mousedown', (e) => dragStart(e.clientY));
        document.addEventListener('mousemove', (e) => dragMove(e.clientY));
        document.addEventListener('mouseup', dragEnd);

        sidebar.appendChild(dragHandle);

        // 1. 创建头部
        const header = document.createElement('div');
        header.className = 'gemini-sidebar-header';

        const title = document.createElement('div');
        title.className = 'gemini-sidebar-title';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'currentColor');
        svg.style.width = '24px';
        svg.style.height = '24px';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 2C11.5 7.5 7.5 11.5 2 12C7.5 12.5 11.5 16.5 12 22C12.5 16.5 16.5 12.5 22 12C16.5 11.5 12.5 7.5 12 2Z');
        svg.appendChild(path);
        title.appendChild(svg);
        title.appendChild(document.createTextNode(getLang().title));

        const closeBtn = document.createElement('button');
        closeBtn.className = 'gemini-close-btn';
        closeBtn.title = getLang().tip_close || '隐藏';
        closeBtn.textContent = '>';

        header.appendChild(title);
        header.appendChild(closeBtn);

        // 2. 创建双 Tab 按钮
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'gemini-tabs';

        const tabSummary = document.createElement('div');
        tabSummary.className = 'gemini-tab active';
        tabSummary.textContent = getLang().tab_sum;

        const tabTranscript = document.createElement('div');
        tabTranscript.className = 'gemini-tab';
        tabTranscript.textContent = getLang().tab_trans;

        tabsContainer.appendChild(tabSummary);
        tabsContainer.appendChild(tabTranscript);

        const tabActions = document.createElement('div');
        tabActions.className = 'gemini-tab-actions';

        // 1. 重新总结按钮 (带刷新 SVG 图标 - 安全构建版)
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'gemini-icon-btn';
        refreshBtn.title = getLang().tip_refresh;

        const refreshSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        refreshSvg.setAttribute('viewBox', '0 0 24 24');
        refreshSvg.setAttribute('width', '20');
        refreshSvg.setAttribute('height', '20');
        refreshSvg.setAttribute('fill', 'currentColor');
        const refreshPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        refreshPath.setAttribute('d', 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z');
        refreshSvg.appendChild(refreshPath);
        refreshBtn.appendChild(refreshSvg);

        // 2. 切换语言按钮 (更换为 YouTube 翻译 A/文 图标)
        const langBtnWrapper = document.createElement('div');
        langBtnWrapper.className = 'gemini-icon-btn';
        langBtnWrapper.title = getLang().tip_lang;
        langBtnWrapper.appendChild(createSafeSvg('M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z', '20'));

        const uiLangSelect = document.createElement('select');
        uiLangSelect.className = 'gemini-ui-lang-select';
        const uiLangs = [{v:'zh-CN',t:'简体中文'}, {v:'zh-TW',t:'繁体中文'}, {v:'en',t:'English'}, {v:'ja',t:'日本語'}];
        const currentSysLang = GM_getValue(CONFIG.LANG_STORAGE, 'zh-CN');
        uiLangs.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.v; opt.textContent = l.t;
            if (l.v === currentSysLang) opt.selected = true;
            uiLangSelect.appendChild(opt);
        });
        uiLangSelect.addEventListener('change', () => {
            if (confirm(getLang().msg_reload)) { GM_setValue(CONFIG.LANG_STORAGE, uiLangSelect.value); window.location.reload(); }
            else { uiLangSelect.value = currentSysLang; }
        });
        langBtnWrapper.appendChild(uiLangSelect);

        // 3. 切换主题按钮
        const themeBtn = document.createElement('button');
        themeBtn.className = 'gemini-icon-btn';
        themeBtn.title = getLang().tip_theme || '切换主题';
        const themeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        themeSvg.setAttribute('viewBox', '0 0 24 24'); themeSvg.setAttribute('width', '20'); themeSvg.setAttribute('height', '20'); themeSvg.setAttribute('fill', 'currentColor');
        const themePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        themeSvg.appendChild(themePath); themeBtn.appendChild(themeSvg);

        const updateThemeIcon = () => {
            const isLight = isLightMode();
            themePath.setAttribute('d', isLight ? 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z' : 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06z');
        };
        updateThemeIcon();
        themeBtn.addEventListener('click', () => {
            const mainBtn = document.querySelector('.gemini-summarizer-btn');
            if (!mainBtn) return;

            // 1. 获取当前按钮状态并反转
            const isCurrentlyLight = mainBtn.classList.contains('light-mode');
            const newIsLight = !isCurrentlyLight;

            // 2. 执行切换
            if (newIsLight) {
                mainBtn.classList.add('light-mode');
            } else {
                mainBtn.classList.remove('light-mode');
            }

            // 3. 差异化持久化逻辑
            if (isMobileMode()) {
                // 如果是手机端，将结果永久保存
                GM_setValue(CONFIG.THEME_STORAGE, newIsLight ? 'light' : 'dark');
            } else {
                // 如果是电脑端，不执行 GM_setValue，刷新即丢失，回归原生
            }

            // 4. 同步更新图标（太阳/月亮）
            updateThemeIconByStatus(newIsLight);
        });

        // 辅助函数：根据传入状态更新图标
        const updateThemeIconByStatus = (statusIsLight) => {
            sidebar.classList.toggle('light-theme', statusIsLight);

            if (statusIsLight) {
                // 亮色模式，显示月亮
                themePath.setAttribute('d', 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z');
            } else {
                // 深色模式，显示太阳
                themePath.setAttribute('d', 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06z');
            }
        };

        // 初始同步图标
        updateThemeIconByStatus(getTargetTheme());

        // 4. 设置按钮 (移到了右上角，YouTube齿轮图标)
        const topSettingsBtn = document.createElement('button');
        topSettingsBtn.className = 'gemini-icon-btn';
        topSettingsBtn.title = getLang().btn_set;
        topSettingsBtn.appendChild(createSafeSvg('M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z', '20'));
        topSettingsBtn.addEventListener('click', () => {
            tabSummary.click();
            showSettings(sidebar.querySelector('#gemini-summary-content'));
        });

        // 按序挂载到顶部
        tabActions.appendChild(refreshBtn);
        tabActions.appendChild(langBtnWrapper);
        tabActions.appendChild(themeBtn);
        tabActions.appendChild(topSettingsBtn);
        tabsContainer.appendChild(tabActions);

        // --- 重新总结逻辑 (1分钟 CD) ---
        refreshBtn.addEventListener('click', () => {
            const now = Date.now();
            // 使用 GM_getValue，哪怕用户刷新了网页，倒计时也依然有效
            const lastTime = GM_getValue('gemini_last_refresh_time', 0);
            const cooldown = 1 * 60 * 1000; // 1分钟 = 60,000毫秒
            const timeDiff = now - lastTime;

            // 1. 检查是否在冷却时间内
            if (timeDiff < cooldown) {
                const remain = cooldown - timeDiff;
                const m = Math.floor(remain / 1000 / 60);
                const s = Math.floor((remain / 1000) % 60);

                // 调用多语言替换时间的占位符
                alert(getLang().msg_cd.replace('{s}', s));

                return;
            }

            const { videoId } = getVideoInfo();
            if (!videoId) return;

            // 2. 通过校验，记录本次重新请求的时间戳
            GM_setValue('gemini_last_refresh_time', now);

            // 3. 删除缓存，强制让程序向大模型再要一份新的
            summaryCache.delete(videoId);

            // 4. 自动切回总结面板并开始请求
            tabSummary.click();
            handleSummarize(sidebar);
        });

        // 3. 创建双内容区
        const summaryContent = document.createElement('div');
        summaryContent.className = 'gemini-tab-content active';
        summaryContent.id = 'gemini-summary-content';

        const loading = document.createElement('div');
        loading.className = 'gemini-loading';
        const spinner = document.createElement('div');
        spinner.className = 'gemini-spinner';
        const loadingText = document.createElement('div');
        loadingText.textContent = getLang().empty_sum;
        loading.appendChild(spinner);
        loading.appendChild(loadingText);
        summaryContent.appendChild(loading);

        const transcriptContent = document.createElement('div');
        transcriptContent.className = 'gemini-tab-content';
        transcriptContent.id = 'gemini-transcript-content';

        // 先创建字幕列表容器
        const transcriptList = document.createElement('div');
        transcriptList.id = 'gemini-transcript-list';
        transcriptContent.appendChild(transcriptList);


        // Tab 切换逻辑绑定
        tabSummary.addEventListener('click', () => {
            tabSummary.classList.add('active');
            tabTranscript.classList.remove('active');
            summaryContent.classList.add('active');
            transcriptContent.classList.remove('active');

            copyBtn.style.display = 'block';
            translateBtn.style.display = 'none';
            langSelect.style.display = 'none';

        });

        // 底部按钮容器及所有按钮创建
        const actions = document.createElement('div');
        actions.className = 'gemini-actions';


        // 搜索入口按钮
        const compactSearchBtn = document.createElement('button');
        compactSearchBtn.className = 'gemini-compact-search-btn';
        compactSearchBtn.style.display = 'none'; 
        const compactText = document.createElement('div');
        compactText.className = 'gemini-compact-search-text';
        compactText.textContent = getLang().search_btn;
        const compactIconDiv = document.createElement('div');
        compactIconDiv.className = 'gemini-compact-search-icon';
        compactIconDiv.appendChild(createSafeSvg(SEARCH_ICON_PATH, '16'));
        compactSearchBtn.appendChild(compactText);
        compactSearchBtn.appendChild(compactIconDiv);

        // 覆盖型展开搜索栏
        const searchOverlay = document.createElement('div');
        searchOverlay.className = 'gemini-search-overlay';

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'gemini-search-wrapper';

        const searchInput = document.createElement('input');
        searchInput.className = 'gemini-search-input';
        searchInput.placeholder = getLang().search_ph;

        const searchClear = document.createElement('button');
        searchClear.className = 'gemini-search-clear';
        searchClear.appendChild(createSafeSvg(CLEAR_ICON_PATH, '18'));

        const searchFoldBtn = document.createElement('button');
        searchFoldBtn.className = 'gemini-search-fold-btn';
        searchFoldBtn.appendChild(createSafeSvg('M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z', '20'));
        searchWrapper.appendChild(searchInput);
        searchWrapper.appendChild(searchClear);
        searchWrapper.appendChild(searchFoldBtn);
        searchOverlay.appendChild(searchWrapper);

        // 其他原有按钮 (去掉了设置按钮)
        const copyBtn = document.createElement('button');
        copyBtn.className = 'gemini-action-btn gemini-copy-btn';
        copyBtn.textContent = getLang().btn_copy;

        const translateBtn = document.createElement('button');
        translateBtn.className = 'gemini-action-btn gemini-translate-btn';
        translateBtn.style.display = 'none';
        translateBtn.textContent = getLang().btn_trans;

        const exportBtn = document.createElement('button');
        exportBtn.className = 'gemini-action-btn export-btn';
        exportBtn.style.display = 'none';
        exportBtn.textContent = getLang().btn_export;

        const langSelect = document.createElement('select');
        langSelect.className = 'gemini-lang-select';
        langSelect.style.display = 'none';
        langSelect.title = '切换语言';
        const langs =[{v:'zh-CN',t:'简体中文'}, {v:'zh-TW',t:'繁体中文'}, {v:'en',t:'English'}, {v:'ja',t:'日本語'}];
        langs.forEach(l => { const opt = document.createElement('option'); opt.value = l.v; opt.textContent = l.t; langSelect.appendChild(opt); });

        // 视频对话 UI
        // 假输入框 (向Gemini提问)
        const askBtn = document.createElement('button');
        askBtn.className = 'gemini-compact-ask-btn';
        const askText = document.createElement('div');
        askText.className = 'gemini-compact-ask-text';
        askText.textContent = getLang().chat_ph;

        const askIconDiv = document.createElement('div');
        askIconDiv.className = 'gemini-compact-ask-icon';

        const askSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        askSvg.setAttribute('viewBox', '0 0 24 24');
        askSvg.setAttribute('width', '20');
        askSvg.setAttribute('height', '20');
        askSvg.setAttribute('fill', 'currentColor');
        askSvg.setAttribute('stroke', 'currentColor');
        askSvg.setAttribute('stroke-width', '1.7');
        askSvg.setAttribute('stroke-linecap', 'round');
        askSvg.setAttribute('stroke-linejoin', 'round');
        const askPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        askPath.setAttribute('d', 'M12 3 C12 8 16 12 21 12 C16 12 12 16 12 21 C12 16 8 12 3 12 C8 12 12 8 12 3 Z');
        askSvg.appendChild(askPath);
        askIconDiv.appendChild(askSvg);

        askBtn.appendChild(askText);
        askBtn.appendChild(askIconDiv);

        // 真输入框 (加入默认词与一键清除交互)
        const chatInputOverlay = document.createElement('div');
        chatInputOverlay.className = 'gemini-chat-input-overlay';
        const chatWrapper = document.createElement('div');
        chatWrapper.className = 'gemini-search-wrapper';
        const chatInput = document.createElement('textarea');
        chatInput.className = 'gemini-chat-input';
        const chatClearTextBtn = document.createElement('button');
        chatInput.placeholder = getLang().chat_ph;
        chatInput.rows = 1;

        // --- 新增：动态调整高度函数 (改良版) ---
        const adjustInputHeight = () => {
            chatInput.style.height = '36px'; // 每次输入先缩回，以测算真实撑开的高度
            const scrollHeight = chatInput.scrollHeight;

            if (scrollHeight > 150) {
                chatInput.style.height = '150px';
                chatInput.style.overflowY = 'auto'; // 超出才显示滚动条
            } else {
                chatInput.style.height = scrollHeight + 'px';
                chatInput.style.overflowY = 'hidden';
            }
        };

        // 绑定输入事件：高度随内容变化，并控制清除按钮显示
        chatInput.addEventListener('input', () => {
            adjustInputHeight();
            chatClearTextBtn.style.display = chatInput.value.length > 0 ? 'flex' : 'none';
        });

        // 默认填入提示词
        chatInput.value = getLang().chat_default_q;

        // 输入框自带的 X 按钮
        chatClearTextBtn.className = 'gemini-chat-clear-text';
        chatClearTextBtn.appendChild(createSafeSvg(CLEAR_ICON_PATH, '16'));
        chatClearTextBtn.style.display = 'flex';

        // 交互：只要输入框获得焦点，如果是默认词就清空 (改用 focus 更严谨，兼容键盘 Tab 切换)
        chatInput.addEventListener('focus', function() {
            if (this.value === getLang().chat_default_q) {
                this.value = '';
                adjustInputHeight(); // 重新计算高度
                chatClearTextBtn.style.display = 'none';
            }
        });

        // 监听点击 X 按钮：清空内容并重置高度与状态
        chatClearTextBtn.addEventListener('click', () => {
            chatInput.value = '';
            chatInput.style.height = '36px';
            chatInput.style.overflowY = 'hidden';
            chatClearTextBtn.style.display = 'none';
            chatInput.focus();
        });

        const chatSendBtn = document.createElement('button');
        chatSendBtn.className = 'gemini-chat-send-btn';
        chatSendBtn.title = getLang().chat_send || '提交';
        chatSendBtn.appendChild(createSafeSvg('M2.01 21L23 12 2.01 3 2 10l15 2-15 2z', '18'));

        const chatFoldBtn = document.createElement('button');
        chatFoldBtn.className = 'gemini-chat-fold-btn';
        chatFoldBtn.title = getLang().tip_close;
        chatFoldBtn.appendChild(createSafeSvg('M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z', '22'));

        chatWrapper.appendChild(chatInput);
        chatWrapper.appendChild(chatClearTextBtn);
        chatWrapper.appendChild(chatSendBtn);
        chatWrapper.appendChild(chatFoldBtn);
        chatInputOverlay.appendChild(chatWrapper);

        // 聊天回复独立面板
        const chatPanel = document.createElement('div');
        chatPanel.className = 'gemini-chat-panel';
        const chatHeader = document.createElement('div');
        chatHeader.className = 'gemini-chat-header';
        const chatBackBtn = document.createElement('button');
        chatBackBtn.className = 'gemini-chat-back-btn';
        chatBackBtn.title = getLang().tip_close;
        chatBackBtn.appendChild(createSafeSvg('M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z', '22'));
        const chatTitle = document.createElement('span');
        chatTitle.textContent = getLang().chat_title;
        const chatClearBtn = document.createElement('button');
        chatClearBtn.className = 'gemini-chat-clear-btn';
        chatClearBtn.title = getLang().chat_clear_tip;
        chatClearBtn.appendChild(createSafeSvg('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z', '18'));

        // 提问面板折叠整个面板按钮
        const chatCloseSidebarBtn = document.createElement('button');
        chatCloseSidebarBtn.className = 'gemini-chat-close-sidebar-btn';
        chatCloseSidebarBtn.title = getLang().tip_close;
        chatCloseSidebarBtn.textContent = '>';
        chatHeader.appendChild(chatBackBtn);
        chatHeader.appendChild(chatTitle);
        chatHeader.appendChild(chatClearBtn);
        chatHeader.appendChild(chatCloseSidebarBtn);
        const chatContent = document.createElement('div');
        chatContent.className = 'gemini-chat-content';
        chatPanel.appendChild(chatHeader); chatPanel.appendChild(chatContent);

        actions.appendChild(copyBtn);// 总结页：复制按钮
        actions.appendChild(askBtn);// 总结页：提问假框

        actions.appendChild(langSelect);// 字幕页：语言
        actions.appendChild(translateBtn);// 字幕页：翻译
        actions.appendChild(exportBtn);// 字幕页：导出
        actions.appendChild(compactSearchBtn); // 字幕页：搜索假框

        actions.appendChild(searchOverlay);// 字幕页：真搜索覆盖层
        actions.appendChild(chatInputOverlay); // 总结页：真聊天覆盖层


        // 统一控制聊天面板显示/隐藏的函数（实现主折叠按钮的隐藏/恢复互斥）
        const showChatUI = () => {
            chatInputOverlay.classList.add('active');
            chatPanel.classList.add('active');
            closeBtn.style.opacity = '0';
            closeBtn.style.pointerEvents = 'none';
        };
        const hideChatUI = () => {
            chatInputOverlay.classList.remove('active');
            chatPanel.classList.remove('active');
            closeBtn.style.opacity = '1';
            closeBtn.style.pointerEvents = 'auto';
        };

        // --- 强制重置所有悬浮层状态 ---
        function resetAllOverlays() {
            searchOverlay.classList.remove('active');
            hideChatUI();

            if (searchInput.value !== '') {
                setTimeout(() => {
                    searchInput.value = '';
                    performSearch();
                }, 300);
            }
        };

        // --- 修改 Tab 切换时的按钮显示与悬浮层互斥 ---
        tabSummary.addEventListener('click', () => {
            tabSummary.classList.add('active'); tabTranscript.classList.remove('active');
            summaryContent.classList.add('active'); transcriptContent.classList.remove('active');

            resetAllOverlays(); // 切换 Tab 时强制关闭所有悬浮层

            askBtn.style.display = 'flex'; copyBtn.style.display = 'block';
            compactSearchBtn.style.display = 'none'; exportBtn.style.display = 'none';
            translateBtn.style.display = 'none'; langSelect.style.display = 'none';
        });

        tabTranscript.addEventListener('click', () => {
            tabTranscript.classList.add('active'); tabSummary.classList.remove('active');
            transcriptContent.classList.add('active'); summaryContent.classList.remove('active');

            resetAllOverlays(); // 切换 Tab 时强制关闭所有悬浮层

            askBtn.style.display = 'none'; copyBtn.style.display = 'none';
            compactSearchBtn.style.display = 'flex'; exportBtn.style.display = 'block';
            translateBtn.style.display = 'block'; langSelect.style.display = 'block';
            if (!transcriptList.dataset.loaded) loadTranscript(transcriptList);
        });

        // ================= 搜索与提问入口的点击互斥逻辑 =================
        // 1. 展开真输入框 (提问)
        askBtn.addEventListener('click', () => {
            resetAllOverlays();
            showChatUI();
        });

        // 2. 展开真搜索栏 (搜索)
        compactSearchBtn.addEventListener('click', () => {
            resetAllOverlays(); // 打开搜索前，先确保提问层完全死透
            searchOverlay.classList.add('active');
            searchInput.focus();
        });

        // 3. 折叠箭头逻辑 (双向关闭)
        searchFoldBtn.addEventListener('click', () => {
            searchOverlay.classList.remove('active');
            // 👈 延迟 300ms，等 CSS 动画丝滑播完再执行高强度的 DOM 重置
            setTimeout(() => {
                if (searchInput.value.trim() !== '') {
                    searchInput.value = '';
                    performSearch();
                }
            }, 300);
        });

        // 使用统一函数，确保面板收起时主折叠按钮会恢复出来
        chatFoldBtn.addEventListener('click', hideChatUI);
        chatBackBtn.addEventListener('click', hideChatUI);

        // 这颗新按钮点击后，不仅收起自身聊天框，还要隐藏整个大侧边栏
        chatCloseSidebarBtn.addEventListener('click', () => {
            sidebar.classList.remove('active');
            setTimeout(hideChatUI, 300);
        });


        // 4. 唯一清空逻辑
        chatClearBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(getLang().chat_clear_confirm)) {
                chatContent.replaceChildren();
                chatInput.value = getLang().chat_default_q;
                chatInput.style.height = '36px'; // 👈 新增这一行！强制高度缩回
                if (chatClearTextBtn) chatClearTextBtn.style.display = 'flex';
            }
        };

        // 4. 发送问题逻辑
        const sendChatMessage = async () => {
            const question = chatInput.value.trim();
            if (!question) return;

            showChatUI();
            const userMsg = document.createElement('div');
            userMsg.className = 'gemini-chat-msg user';
            const userSpan = document.createElement('span');
            userSpan.textContent = question;
            userMsg.appendChild(userSpan);
            chatContent.appendChild(userMsg);

            // 发送后清空输入框、重置高度并隐藏 X 按钮
            chatInput.value = '';
            chatInput.style.height = '36px'; // 👈 强制缩回 1 行高度
            chatInput.style.overflowY = 'hidden';
            chatClearTextBtn.style.display = 'none';

            // 渲染 AI 的“高级动画”气泡
            const aiMsg = document.createElement('div');
            aiMsg.className = 'gemini-chat-msg ai';
            const aiSpan = document.createElement('span');
            const spinnerContainer = document.createElement('div');
            spinnerContainer.className = 'gemini-pro-spinner';


            // 旋转外环 (重新微调色系，更贴近 Gemini 3)
            const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            ringSvg.setAttribute('class', 'spinner-ring');
            ringSvg.setAttribute('viewBox', '0 0 24 24');

            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            gradient.setAttribute('id', 'gemini-ring-grad');
            gradient.setAttribute('x1', '0%'); gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%'); gradient.setAttribute('y2', '100%');

            // 使用更柔和的 4 色渐变
            const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', '#4285f4'); // 经典蓝
            const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop2.setAttribute('offset', '40%'); stop2.setAttribute('stop-color', '#b46ee0'); // 柔和紫
            const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop3.setAttribute('offset', '70%'); stop3.setAttribute('stop-color', '#e87968'); // 玫瑰粉
            const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop4.setAttribute('offset', '100%'); stop4.setAttribute('stop-color', '#fbbc04'); // 亮橙黄

            gradient.appendChild(stop1); gradient.appendChild(stop2);
            gradient.appendChild(stop3); gradient.appendChild(stop4);
            defs.appendChild(gradient);
            ringSvg.appendChild(defs);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', 'url(#gemini-ring-grad)');
            circle.setAttribute('stroke-width', '1.5'); 
            circle.setAttribute('stroke-dasharray', '45 18');
            circle.setAttribute('stroke-linecap', 'round');
            ringSvg.appendChild(circle);

            // 内部蓝色 Gemini 实体图标
            const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            iconSvg.setAttribute('class', 'gemini-icon');
            iconSvg.setAttribute('viewBox', '0 0 24 24');
            const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            iconPath.setAttribute('d', 'M12 3 C12 8 16 12 21 12 C16 12 12 16 12 21 C12 16 8 12 3 12 C8 12 12 8 12 3 Z');
            iconPath.setAttribute('fill', '#4285f4'); // 蓝色中心
            iconSvg.appendChild(iconPath);

            spinnerContainer.appendChild(ringSvg);
            spinnerContainer.appendChild(iconSvg);

            aiSpan.appendChild(spinnerContainer);
            aiSpan.appendChild(document.createTextNode(getLang().chat_thinking));

            aiMsg.appendChild(aiSpan);
            chatContent.appendChild(aiMsg);

            setTimeout(() => { chatContent.scrollTop = chatContent.scrollHeight; }, 50);

            try {
                const apiKey = getApiKey();
                if (!apiKey) {
                    aiSpan.textContent = getLang().chat_key_err;
                    return;
                }

                await new Promise(r => setTimeout(r, 100));

                if (!transcriptList.dataset.loaded) {
                    await loadTranscript(transcriptList);
                }

                let contextText = '';
                const tItems = transcriptList.querySelectorAll('.gemini-chapter-text');

                if (tItems.length > 0) {
                    contextText = Array.from(tItems).map(i => i.dataset.original || i.textContent).join(' ');
                } else {
                    contextText = sidebar.dataset.currentSummary || "";
                }

                if (!contextText.trim()) {
                    throw new Error(getLang().chat_no_context);
                }

                if (contextText.length > 80000) {
                    contextText = contextText.substring(0, 80000) + '...[后续内容已截断]';
                }

                const answer = await callGeminiChatAPI(contextText, question, apiKey);

                // 收到回复
                aiSpan.textContent = '';

                const bubbleCopyBtn = document.createElement('button');
                bubbleCopyBtn.className = 'gemini-bubble-copy-btn';
                bubbleCopyBtn.title = getLang().bubble_copy_tip;

                // 创建复制图标包裹层
                const copyIconWrap = document.createElement('div');
                copyIconWrap.className = 'copy-icon';
                copyIconWrap.appendChild(createSafeSvg('M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z', '14'));

                // 创建勾号图标包裹层
                const checkIconWrap = document.createElement('div');
                checkIconWrap.className = 'check-icon';
                checkIconWrap.textContent = '✓';

                bubbleCopyBtn.appendChild(copyIconWrap);
                bubbleCopyBtn.appendChild(checkIconWrap);

                // 绑定点击复制逻辑
                bubbleCopyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    navigator.clipboard.writeText(answer).then(() => {
                        bubbleCopyBtn.classList.add('copied');
                        setTimeout(() => {
                            bubbleCopyBtn.classList.remove('copied');
                        }, 1500);
                    });
                });

                aiSpan.appendChild(bubbleCopyBtn);

                // 渲染 AI 回复的正文内容
                const lines = answer.split('\n');
                lines.forEach((line, index) => {
                    const parts = line.split(/(\*\*.*?\*\*)/g);
                    parts.forEach(part => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            const strong = document.createElement('strong');
                            strong.textContent = part.slice(2, -2);
                            aiSpan.appendChild(strong);
                        } else if (part) {
                            aiSpan.appendChild(document.createTextNode(part));
                        }
                    });
                    if (index < lines.length - 1) {
                        aiSpan.appendChild(document.createElement('br'));
                    }
                });


            } catch (err) {
                console.error('[Gemini Summarizer] Chat Error:', err);
                aiSpan.textContent = `${getLang().chat_err}${err.message}`;
            }

           setTimeout(() => {
    // 获取气泡相对于窗口顶部的距离
    const aiMsgTop = aiMsg.getBoundingClientRect().top;
    // 获取滚动容器（chatContent）相对于窗口顶部的距离
    const containerTop = chatContent.getBoundingClientRect().top;
    // 预留的呼吸间距
    const yOffset = -10;
    // 公式：(气泡视口Top - 容器视口Top) + 容器当前已滚动的距离 + 偏移量
    const y = (aiMsgTop - containerTop) + chatContent.scrollTop + yOffset;


        chatContent.scrollTo({top: y,behavior: 'smooth'});}, 50);};
        chatSendBtn.addEventListener('click', sendChatMessage);

        chatInput.addEventListener('keydown', (e) => {
            // 如果只按下 Enter (不带 Shift)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // 阻止 textarea 默认的换行行为
                sendChatMessage();
            }
            // 如果按下 Shift + Enter，则保持默认行为（换行），adjustInputHeight 会处理高度
        });


        // 组装并监听全局点击跳转
        sidebar.appendChild(header);
        sidebar.appendChild(tabsContainer);
        sidebar.appendChild(chatPanel);
        sidebar.appendChild(summaryContent);
        sidebar.appendChild(transcriptContent);

       // 翻译逻辑更换为 Google 翻译免Key分块版)
        translateBtn.addEventListener('click', async () => {
            const transcriptContent = sidebar.querySelector('#gemini-transcript-content');
            const items = transcriptContent.querySelectorAll('.gemini-chapter-item');

            if (translateBtn.classList.contains('cancel')) {
                items.forEach(item => {
                    const textSpan = item.querySelector('.gemini-chapter-text');
                    if (textSpan.dataset.original) textSpan.textContent = textSpan.dataset.original;
                });
                translateBtn.textContent = getLang().btn_trans;
                translateBtn.classList.remove('cancel');
                return;
            }

            translateBtn.disabled = true;
            translateBtn.textContent = getLang().btn_translating;

            try {
                const targetLang = langSelect.value;

                items.forEach((item) => {
                    const textSpan = item.querySelector('.gemini-chapter-text');
                    if (!textSpan.dataset.original) textSpan.dataset.original = textSpan.textContent;
                });

                // 分块并发翻译 (每 60 句切成一块，防止超出 Google 接口限制)
                const chunkSize = 60;
                for (let i = 0; i < items.length; i += chunkSize) {
                    let chunkText = "";
                    for (let j = i; j < i + chunkSize && j < items.length; j++) {
                        const textSpan = items[j].querySelector('.gemini-chapter-text');
                        chunkText += `[${j}] ${textSpan.dataset.original}\n`;
                    }

                    // 调用 Google 翻译 API
                    const result = await translateWithGoogle(chunkText, targetLang);

                    // 稳健正则解析并回填：构建【双语对照】结构
                    result.split('\n').forEach(line => {
                        const match = line.match(/^\[\s*(\d+)\s*\]\s*(.*)/);
                        if (match && items[match[1]]) {
                            const textContainer = items[match[1]].querySelector('.gemini-chapter-text');
                            const originalText = textContainer.dataset.original; 
                            const translatedText = match[2]; 

                            // 清空原本的单行文字
                            textContainer.textContent = '';

                            // 创建原文块 (依然保持亮白色)
                            const origDiv = document.createElement('div');
                            origDiv.textContent = originalText;

                            // 创建译文块 (带有褪色和左侧高级边框线)
                            const transDiv = document.createElement('div');
                            transDiv.className = 'gemini-trans-text';
                            transDiv.textContent = translatedText;

                            // 将原文和译文同时塞进去，上下排列
                            textContainer.appendChild(origDiv);
                            textContainer.appendChild(transDiv);
                        }
                    });
                }

                translateBtn.textContent = getLang().btn_trans_cancel;
                translateBtn.classList.add('cancel');
            } catch (err) {
                alert('Translation failed: ' + err.message);
                translateBtn.textContent = getLang().btn_trans;
            } finally {
                translateBtn.disabled = false;
            }
        });

        // 将按钮栏加入侧边栏
        sidebar.appendChild(actions);

        // --- 悬浮同步按钮创建 ---
        const syncBtn = document.createElement('button');
        syncBtn.className = 'gemini-sync-btn';

        const syncSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        syncSvg.setAttribute('viewBox', '0 0 24 24');
        syncSvg.setAttribute('width', '16');
        syncSvg.setAttribute('height', '16');
        syncSvg.setAttribute('fill', 'currentColor');

        const syncPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        syncPath.setAttribute('d', 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z');
        syncSvg.appendChild(syncPath);

        syncBtn.appendChild(syncSvg);
        syncBtn.appendChild(document.createTextNode(getLang().btn_sync));

        sidebar.appendChild(syncBtn);

        let autoScroll = true;

        // 监听用户的强行滚动/触摸，打断自动跟随并弹出按钮
        const stopAutoScroll = () => {
            if (autoScroll && tabTranscript.classList.contains('active')) {
                autoScroll = false;
                syncBtn.classList.add('show'); 
            }
        };
        // 绑定鼠标滚轮、触摸滑动、鼠标拖拽等打断事件
        transcriptContent.addEventListener('wheel', stopAutoScroll, {passive: true});
        transcriptContent.addEventListener('touchmove', stopAutoScroll, {passive: true});
        transcriptContent.addEventListener('mousedown', stopAutoScroll, {passive: true});

        // 点击“与视频时间同步”按钮：恢复跟随并隐藏按钮
        syncBtn.addEventListener('click', () => {
            autoScroll = true;
            syncBtn.classList.remove('show');
            // 改为在 transcriptList 中查找
            const activeItem = transcriptList.querySelector('.active-line');
            if (activeItem) {
                // 平滑滚动回当前播放位置
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        // 定时器：每 0.5 秒检查进度，高亮当前字幕
        setInterval(() => {
            // 如果没打开侧边栏，或者切到了“总结”Tab，隐藏同步按钮并停止计算
            if (!sidebar.classList.contains('active') || !tabTranscript.classList.contains('active')) {
                syncBtn.classList.remove('show');
                return;
            }

            const video = document.querySelector('video');
            // 检查目标必须是 transcriptList，否则代码会在这里死掉！
            if (!video || !transcriptList.dataset.loaded) return;

            const currentTime = video.currentTime;
            // 从 transcriptList 中读取所有的字幕行
            const items = transcriptList.querySelectorAll('.gemini-chapter-item');
            let activeItem = null;

            // 寻找当前时间正在播放的那一行字幕
            for (let i = 0; i < items.length; i++) {
                const startSec = parseFloat(items[i].dataset.startSec || 0);
                if (startSec <= currentTime) {
                    activeItem = items[i];
                } else {
                    break;
                }
            }

            // 如果找到了正在播放的字幕行，并且它还没被高亮
            if (activeItem && !activeItem.classList.contains('active-line')) {
                // 移除其他行的亮色
                items.forEach(i => i.classList.remove('active-line'));
                // 点亮当前行
                activeItem.classList.add('active-line');
                // 如果处于自动同步状态，滚动面板让高亮行居中
                if (autoScroll) {
                    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }, 500);

        // 点击某行字幕：跳转视频进度，并自动恢复同步状态
        sidebar.addEventListener('click', (e) => {
            const chapterItem = e.target.closest('.gemini-chapter-item');
            if (chapterItem && chapterItem.dataset.timestamp) {
                const timeStr = chapterItem.dataset.timestamp;
                const timeParts = timeStr.split(':').reverse();
                let totalSeconds = 0;
                for (let i = 0; i < timeParts.length; i++) {
                    totalSeconds += parseInt(timeParts[i], 10) * Math.pow(60, i);
                }
                const videoEl = document.querySelector('video');
                if (videoEl) {
                    videoEl.currentTime = totalSeconds;
                    videoEl.play();
                    autoScroll = true;
                    syncBtn.classList.remove('show');
                }
            }
        });

        document.body.appendChild(sidebar);

        // 搜索与清除功能
        const performSearch = () => {
            const query = searchInput.value.toLowerCase().trim();
            searchClear.style.display = query.length > 0 ? 'flex' : 'none';

            const items = transcriptList.querySelectorAll('.gemini-chapter-item');
            items.forEach(item => {
                const text = item.querySelector('.gemini-chapter-text').textContent.toLowerCase();
                item.style.display = text.includes(query) ? 'flex' : 'none';
            });
        };

        searchInput.addEventListener('input', performSearch);
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            performSearch();
            searchInput.focus();
        });

        // 导出字幕功能
        exportBtn.addEventListener('click', () => {
            const items = transcriptList.querySelectorAll('.gemini-chapter-item');
            if (items.length === 0) return;

            let exportText = `${getLang().export_title}${document.title}\n${getLang().export_link}${window.location.href}\n\n`;

            items.forEach(item => {
                const time = item.querySelector('.gemini-time-text').textContent;
                // 如果当前有翻译，会把原文和译文都导出
                const text = item.querySelector('.gemini-chapter-text').innerText;
                exportText += `[${time}] ${text}\n`;
            });

            const blob = new Blob([exportText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${getLang().btn_export}_${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);

            // 反馈效果
            const originalText = exportBtn.textContent;
            exportBtn.textContent = getLang().btn_exported;
            setTimeout(() => { exportBtn.textContent = originalText; }, 2000);
        });

        return sidebar;
    }

    // 辅助函数：格式化秒数为 MM:SS
    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // ==================== 原生安全字幕提取核心 ====================
    async function loadTranscript(container) {
        container.textContent = '';

        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = 'text-align:center; padding:30px; color:#aaa; line-height: 1.6;';

        loadingMsg.appendChild(document.createTextNode(getLang().transcript_loading));
        loadingMsg.appendChild(document.createElement('br'));
        loadingMsg.appendChild(document.createElement('br'));

        const tipSpan = document.createElement('span');
        tipSpan.style.cssText = 'font-size:13px; color:#3ea6ff; font-weight: bold;';
        tipSpan.textContent = getLang().transcript_tip;
        loadingMsg.appendChild(tipSpan);
        container.appendChild(loadingMsg);

        try {
            const { videoId } = getVideoInfo();
            if (!videoId) throw new Error("无法获取视频 ID");

            let rawText = capturedSubtitles.get(videoId);
            let waitCount = 0;
            // 尝试等待底层拦截的数据，最大等待时间 8 秒
            while (!rawText && waitCount < 16) {
                await new Promise(r => setTimeout(r, 500));
                rawText = capturedSubtitles.get(videoId);
                waitCount++;
            }

            // 如果拦截失败，尝试利用原生页面对象拉取
            if (!rawText) {
                const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                let playerResponse = document.getElementById('movie_player')?.getPlayerResponse?.() || win.ytInitialPlayerResponse;

                const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
                if (captions && captions.captionTracks && captions.captionTracks.length > 0) {
                    const tracks = captions.captionTracks;
                    let targetTrack = tracks.find(t => t.languageCode.includes('zh'));
                    let fetchUrl = '';

                    if (targetTrack) {
                        fetchUrl = targetTrack.baseUrl;
                    } else {
                        targetTrack = tracks[0];
                        // 为了避免签名验证失败，仅追加 YouTube 官方的 tlang 参数，让其下发中文
                        const urlObj = new URL(targetTrack.baseUrl);
                        urlObj.searchParams.set('tlang', 'zh-Hans');
                        fetchUrl = urlObj.toString();
                    }

                    const res = await window.fetch(fetchUrl);
                    if (res.ok) rawText = await res.text();
                }
            }

            if (!rawText || rawText.trim() === '') {
                throw new Error('未能获取到字幕流，请确保视频带有字幕并在播放器中开启了"CC"。');
            }

            // 解析 JSON 或 XML 格式的数据，纯正则匹配
            let segments = [];
            const trimmed = rawText.trim();

            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {              
                const data = JSON.parse(trimmed);
                if (!data.events || data.events.length === 0) throw new Error('字幕 JSON 解析失败。');
                data.events.forEach(ev => {
                    if (ev.segs) {
                        const fullText = ev.segs.map(s => s?.utf8 || "").join('').replace(/\n/g, ' ').trim();
                        if (fullText && fullText !== '♪' && !fullText.includes('[音乐]') && !fullText.includes('[Music]')) {
                            segments.push({ start: (ev.tStartMs || 0) / 1000, text: fullText });
                        }
                    }
                });
            } else {
                const regex = /<(text|p)[^>]+(?:start|t)="([\d.]+)"[^>]*>([\s\S]*?)<\/\1>/g;
                let m;
                while ((m = regex.exec(trimmed)) !== null) {
                    const tag = m[1];
                    let timeVal = parseFloat(m[2]);
                    if (tag === 'p') timeVal = timeVal / 1000;

                    const cleanText = (m[3] || "")
                        .replace(/<[^>]+>/g, '')
                        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                        .trim();

                    if (cleanText && cleanText !== '♪' && !cleanText.includes('[Music]') && !cleanText.includes('[音乐]')) {
                        segments.push({ start: timeVal, text: cleanText });
                    }
                }
            }

            if (segments.length === 0) throw new Error('未提取到有效文字，该视频可能全为纯音乐。');

            // 渲染到界面
            container.textContent = '';
            const ul = document.createElement('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0; display:flex; flex-direction:column;';

            segments.forEach(seg => {
                const li = document.createElement('li');
                li.className = 'gemini-chapter-item';
                li.dataset.timestamp = formatTime(seg.start);
                li.dataset.startSec = seg.start;

                const timeSpan = document.createElement('span');
                timeSpan.className = 'gemini-time-text';
                timeSpan.textContent = formatTime(seg.start);

                const textSpan = document.createElement('span');
                textSpan.className = 'gemini-chapter-text';
                textSpan.textContent = seg.text;

                li.appendChild(timeSpan);
                li.appendChild(textSpan);
                ul.appendChild(li);
            });

            container.appendChild(ul);
            container.dataset.loaded = 'true';

        } catch (err) {
            container.textContent = '';
            const errMsg = document.createElement('div');
            errMsg.style.cssText = 'text-align:center; padding:30px; color:#ff4e45; line-height:1.6;';

            const strong = document.createElement('strong');
            strong.textContent = '⚠️ ' + (getLang().transcript_error || '获取字幕出错');
            errMsg.appendChild(strong);
            errMsg.appendChild(document.createElement('br'));
            errMsg.appendChild(document.createTextNode(err.message));

            container.appendChild(errMsg);
        }
    }

    // ==================== 核心功能 ====================

    // 获取当前视频信息
    function getVideoInfo() {
        const urlParams = new URLSearchParams(window.location.search);
        let videoId = urlParams.get('v');

        if (!videoId) {
            const match = window.location.pathname.match(/\/(?:watch|shorts)\/([a-zA-Z0-9_-]+)/);
            if (match) {
                videoId = match[1];
            }
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        let videoTitle = document.title;
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
            document.querySelector('.slim-video-metadata-title');

        if (titleEl) {
            videoTitle = titleEl.textContent;
        }

        return { videoId, videoUrl, videoTitle };
    }

    // ==================== 核心功能：API 调用 ====================

    // 总结视频的 API 调用
    function callGeminiAPI(videoUrl, apiKey) {
        return new Promise((resolve, reject) => {
            const currentModel = GM_getValue(CONFIG.MODEL_STORAGE, 'gemini-3.1-flash-lite-preview');
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;

            // 获取当前系统语言的默认提示词
            const currentLangKey = GM_getValue(CONFIG.LANG_STORAGE, 'zh-CN');
            const defaultPromptForLang = getLang().prompt;

            // 解析新的 JSON 配置结构，兼顾老版本的纯文本
            let prompt = defaultPromptForLang;
            const rawPromptData = GM_getValue(CONFIG.PROMPT_STORAGE + '_' + currentLangKey, '');
            if (rawPromptData) {
                try {
                    const pData = JSON.parse(rawPromptData);
                    const activeItem = pData.list.find(item => item.id === pData.activeId);
                    if (activeItem) prompt = activeItem.content;
                } catch(e) {
                    prompt = rawPromptData;
                }
            };

            const requestData = {
                contents: [{
                    parts: [
                        { fileData: { fileUri: videoUrl } },
                        { text: prompt }
                    ]
                }]
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${apiUrl}?key=${apiKey}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(requestData),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                            resolve(data.candidates[0].content.parts[0].text);
                        } else if (data.error) {
                            reject(new Error(data.error.message || '生成失败'));
                        } else {
                            reject(new Error('无法解析响应'));
                        }
                    } catch (e) {
                        reject(new Error('响应解析失败: ' + e.message));
                    }
                },
                onerror: function () {
                    reject(new Error('网络请求失败'));
                }
            });
        });
    }

    // 视频助教对话的专属 API 调用
    function callGeminiChatAPI(contextText, question, apiKey) {
        return new Promise((resolve, reject) => {
            const currentModel = GM_getValue(CONFIG.MODEL_STORAGE, 'gemini-3.1-flash-lite-preview');
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent`;

            const finalPrompt = getLang().chat_prompt_prefix + contextText + '\n\n' + getLang().chat_prompt_suffix + question;

            const requestData = {
                contents: [{
                    parts: [{ text: finalPrompt }]
                }]
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${apiUrl}?key=${apiKey}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(requestData),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                            resolve(data.candidates[0].content.parts[0].text);
                        } else if (data.error) {
                            reject(new Error(data.error.message || '对话生成失败'));
                        } else {
                            reject(new Error('无法解析响应'));
                        }
                    } catch (e) {
                        reject(new Error('响应解析失败: ' + e.message));
                    }
                },
                onerror: function () {
                    reject(new Error('网络请求失败'));
                }
            });
        });
    }

    // 专用的 Google 翻译免 Key API 调用
    function translateWithGoogle(text, targetLang) {
        return new Promise((resolve, reject) => {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t`;

            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: `q=${encodeURIComponent(text)}`,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        let result = '';
                        if (data && data[0]) {
                            data[0].forEach(item => {
                                if (item[0]) result += item[0];
                            });
                        }
                        resolve(result);
                    } catch (e) {
                        reject(new Error('翻译解析失败'));
                    }
                },
                onerror: () => reject(new Error('翻译网络请求失败'))
            });
        });
    }
   // 专用的 Google 翻译免 Key API 调用
   function translateWithGoogle(text, targetLang) {
    // ... existing code ...
   }

   // ====================  ====================
   function getApiKeyList() {
    const keyInput = document.getElementById('gemini-api-key-input');
    if (!keyInput) return [];
    return keyInput.value.split('\n').map(key => key.trim()).filter(key => key !== '');
  }
  // ====================================================================
    // 显示设置界面
    function showSettings(contentDiv) {
        const currentKey = getApiKey();
        const currentModel = GM_getValue(CONFIG.MODEL_STORAGE, 'gemini-3.1-flash-lite-preview');
        const langDict = getLang();

        contentDiv.textContent = '';
        const settings = document.createElement('div');
        settings.className = 'gemini-settings';

        // 返回按钮
        const returnBtn = document.createElement('button');
        returnBtn.className = 'gemini-return-btn';

        // 左箭头 SVG 图标
        const backSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        backSvg.setAttribute('viewBox', '0 0 24 24');
        backSvg.setAttribute('width', '16');
        backSvg.setAttribute('height', '16');
        backSvg.setAttribute('fill', 'none');
        backSvg.setAttribute('stroke', 'currentColor');
        backSvg.setAttribute('stroke-width', '2');
        backSvg.setAttribute('stroke-linecap', 'round');
        backSvg.setAttribute('stroke-linejoin', 'round');
        const backPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        backPath.setAttribute('d', 'M15 18l-6-6 6-6'); // 原生左向折线
        backSvg.appendChild(backPath);

        returnBtn.appendChild(backSvg);
        returnBtn.appendChild(document.createTextNode(langDict.set_return));

        returnBtn.addEventListener('click', () => {
            const sidebarEl = document.querySelector('.gemini-sidebar');
            const summary = sidebarEl ? sidebarEl.dataset.currentSummary : null;

            if (summary) {
                showSummary(contentDiv, summary);
            } else {
                contentDiv.textContent = '';
                const emptyDiv = document.createElement('div');
                emptyDiv.style.cssText = 'color: var(--gs-text-muted); text-align: center; margin-top: 50px;';
                emptyDiv.textContent = langDict.empty_sum;
                contentDiv.appendChild(emptyDiv);
            }
        });

        settings.appendChild(returnBtn);

        // 模型选择
        const modelLabel = document.createElement('label');
        modelLabel.textContent = langDict.set_model;
        const modelSelect = document.createElement('select');
        const availableModels = [
            { value: 'gemini-3.1-flash-lite-preview', text: 'Gemini 3.1 Flash Lite' },
            { value: 'gemini-3-flash-preview', text: 'Gemini 3 Flash' },
            { value: 'gemini-2.5-flash-lite', text: 'Gemini 2.5 Flash Lite' },
            { value: 'gemini-2.5-flash', text: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.0-flash', text: 'Gemini 2 Flash' },
            { value: 'gemini-3.1-pro', text: 'Gemini 3.1 Pro' }
        ];
        availableModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.text;
            if (m.value === currentModel) opt.selected = true;
            modelSelect.appendChild(opt);
        });
        settings.appendChild(modelLabel);
        settings.appendChild(modelSelect);

        // API Key 输入
        const keyLabel = document.createElement('label');
        keyLabel.textContent = langDict.set_key;
        const input = document.createElement('textarea');
        input.id = 'gemini-api-key-input';
        input.rows = 4;
        input.cols = 50;
        input.placeholder = langDict.set_key_ph;
        input.value = getRawApiKeys().split('\n').map(key => key.trim()).filter(key => key !== '').join('\n');
        input.style.fontFamily = 'monospace';
        input.style.resize = 'vertical';
        settings.appendChild(input);

        // ================== 下面是需要替换的全新代码 ==================

        // 提示词工作台 (Toolbar) 与多配置联动
        const currentLangKey = GM_getValue(CONFIG.LANG_STORAGE, 'zh-CN');
        const defaultPromptForLang = langDict.prompt;

        // 1. 读取并兼容老数据，转化为标准化 JSON 格式
        let promptData = { activeId: 'default', list: [{ id: 'default', name: langDict.prompt_default_name || '默认', content: defaultPromptForLang }] };
        let rawStored = GM_getValue(CONFIG.PROMPT_STORAGE + '_' + currentLangKey, null);
        if (rawStored) {
            try {
                let parsed = JSON.parse(rawStored);
                if (parsed.activeId && parsed.list) promptData = parsed;
                else throw new Error("old format");
            } catch (e) {
                promptData.list[0].content = rawStored; // 把老用户的纯文本无缝塞进"默认"配置里
            }
        }

        const promptLabel = document.createElement('label');
        promptLabel.textContent = langDict.set_prompt;
        settings.appendChild(promptLabel);

        // 2. 创建操作工具栏
        const toolbar = document.createElement('div');
        // 设置 width: 100% 配合 flex，能确保最右侧按钮贴齐容器边缘
toolbar.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:center; width:100%;';

        const promptSelect = document.createElement('select');
        // 调整 padding 确保选择框和右侧的 38px 按钮高度视觉统一
        promptSelect.style.cssText = 'flex:1; margin-bottom:0; padding:9px 10px; box-sizing:border-box;';

        // 统一按钮生成器 (终极原生复刻版)
        const createIconBtn = (svgPath, title) => {
            const btn = document.createElement('button');
            btn.title = title;

            btn.style.cssText = 'background:transparent; border:none; color:#c4c7c5; border-radius:6px; width:38px; height:38px; padding:0; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;';

            btn.onmouseover = () => {
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
                btn.style.color = '#e3e3e3';
            };
            btn.onmouseout = () => {
                btn.style.background = 'transparent';
                btn.style.color = '#c4c7c5';
            };

            // 植入 SVG 节点
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('width', '22');
            svg.setAttribute('height', '22');
            svg.setAttribute('fill', 'currentColor');

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', svgPath);

            svg.appendChild(path);
            btn.appendChild(svg);
            return btn;
        };

        // 像素级精准复刻 Gemini 官方原生图标路径 (Google Material Symbols Outline)

        // 1. 新增 (带有画笔的方形框，真正的 Gemini 官方同款)
        const addBtn = createIconBtn('M5 21q-.825 0-1.413-.587Q3 19.825 3 19V5q0-.825.587-1.413Q4.175 3 5 3h8.925l-2 2H5v14h14v-6.95l2-2V19q0 .825-.587 1.413Q19.825 21 19 21Zm4-6v-4.25l9.175-9.175q.3-.3.675-.45.375-.15.75-.15.375 0 .763.15.387.15.662.45L22.425 3q.275.3.425.663.15.362.15.762 0 .375-.15.75-.15.375-.45.675L13.25 15Zm11.025-9.6-1.425-1.425ZM11.125 13H12.5l6.525-6.525-1.425-1.425L11.125 11.575Z', getLang().prompt_add_tip);

        // 2. 重命名 (标准修长的空心铅笔)
        const renameBtn = createIconBtn('M5 19h1.4l8.625-8.625-1.4-1.4L5 17.6V19ZM19.3 8.925l-4.25-4.2L17.875 3.1q.3-.3.675-.45.375-.15.75-.15.375 0 .763.15.387.15.662.45L21.425 4.5q.3.275.45.663.15.387.15.762 0 .375-.15.75-.15.375-.45.675ZM17.85 10.4 7.1 21H3v-4.1l10.6-10.6Zm-3.525-2.125-.7-.7 1.4 1.4Z',getLang().prompt_rename_tip);

        // 3. 删除 (经典的空心垃圾桶)
        const delBtn = createIconBtn('M7 21q-.825 0-1.413-.587Q5 19.825 5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413Q17.825 21 17 21ZM17 6H7v13h10ZM9 17h2V8H9Zm4 0h2V8h-2ZM7 6v13Z', getLang().prompt_del_tip); // 垃圾桶带竖线

        toolbar.appendChild(promptSelect);
        toolbar.appendChild(addBtn);
        toolbar.appendChild(renameBtn);
        toolbar.appendChild(delBtn);
        settings.appendChild(toolbar);

        const promptInput = document.createElement('textarea');
        promptInput.placeholder = langDict.set_prompt_ph;
        settings.appendChild(promptInput);

        // 3. 核心交互：渲染列表与联动控制
        const renderSelect = () => {
            promptSelect.replaceChildren();
            promptData.list.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = item.name;
                if (item.id === promptData.activeId) opt.selected = true;
                promptSelect.appendChild(opt);
            });
            const activeItem = promptData.list.find(i => i.id === promptData.activeId) || promptData.list[0];
            promptInput.value = activeItem.content;

            // 防呆机制：如果当前是"默认"，禁用删除按钮
            if (promptData.activeId === 'default') {
                delBtn.style.opacity = '0.3';
                delBtn.style.cursor = 'not-allowed';
            } else {
                delBtn.style.opacity = '1';
                delBtn.style.cursor = 'pointer';
            }
        };

        renderSelect(); // 初始渲染

        // 切换下拉框时，瞬间切换下方文本
        promptSelect.addEventListener('change', (e) => {
            promptData.activeId = e.target.value;
            renderSelect();
        });

        // 修改文本时，实时同步到内存中
        promptInput.addEventListener('input', (e) => {
            const activeItem = promptData.list.find(i => i.id === promptData.activeId);
            if (activeItem) activeItem.content = e.target.value;
        });

        // 新增配置
        addBtn.addEventListener('click', () => {
            const newName = prompt(getLang().prompt_name_ph, getLang().prompt_new_default);
            if (newName && newName.trim()) {
                const newId = 'p_' + Date.now();
                promptData.list.push({ id: newId, name: newName.trim(), content: '' });
                promptData.activeId = newId;
                renderSelect();
            }
        });

        // 重命名配置
        renameBtn.addEventListener('click', () => {
            const activeItem = promptData.list.find(i => i.id === promptData.activeId);
            if (activeItem) {
                const newName = prompt(getLang().prompt_rename_ph, activeItem.name);
                if (newName && newName.trim()) {
                    activeItem.name = newName.trim();
                    renderSelect();
                }
            }
        });

        // 删除配置
        delBtn.addEventListener('click', () => {
            if (promptData.activeId === 'default') {
                alert(getLang().prompt_del_error);
                return;
            }
            if (confirm(getLang().prompt_del_confirm || '确定要删除当前选中的提示词配置吗？')) {
                promptData.list = promptData.list.filter(i => i.id !== promptData.activeId);
                promptData.activeId = 'default';
                renderSelect();
            }
        });

        // ================== 保存按钮及说明 ==================
        const saveBtn = document.createElement('button');
        saveBtn.className = 'gemini-settings-save';
        saveBtn.textContent = langDict.set_save;

        const info = document.createElement('div');
        info.className = 'gemini-settings-info';

        info.appendChild(document.createTextNode('💡 '));
        const strong = document.createElement('strong');
        strong.textContent = langDict.help_title;
        info.appendChild(strong);
        info.appendChild(document.createElement('br'));

        info.appendChild(document.createTextNode(langDict.help_1));
        const a1 = document.createElement('a');
        a1.href = 'https://aistudio.google.com/apikey';
        a1.target = '_blank';
        a1.textContent = langDict.help_link_1;
        info.appendChild(a1);
        info.appendChild(document.createElement('br'));

        info.appendChild(document.createTextNode(langDict.help_2));
        info.appendChild(document.createElement('br'));
        info.appendChild(document.createTextNode(langDict.help_3));
        info.appendChild(document.createElement('br'));
        info.appendChild(document.createTextNode(langDict.help_4));
        info.appendChild(document.createElement('br'));

        info.appendChild(document.createTextNode(langDict.help_5));
        const a2 = document.createElement('a');
        a2.href = 'https://aistudio.google.com/rate-limit';
        a2.target = '_blank';
        a2.textContent = langDict.help_link_2;
        info.appendChild(a2);

        // --- 插入赞助链接按钮 ---
        const sponsorLink = document.createElement('a');
        sponsorLink.className = 'gemini-sponsor-link';
        sponsorLink.href = 'https://github.com/Rove24/Rovetify'; // 👈 这里以后填你的 GitHub 地址
        sponsorLink.target = '_blank';
        sponsorLink.textContent = langDict.set_sponsor;

        info.appendChild(sponsorLink);

        settings.appendChild(saveBtn);
        settings.appendChild(info);
        contentDiv.appendChild(settings);

        // ================== 最终的落库保存逻辑 ==================
        saveBtn.addEventListener('click', () => {
            const key = input.value.trim();
            const model = modelSelect.value;
            if (key) {
                saveApiKey(key);
                GM_setValue(CONFIG.MODEL_STORAGE, model);
                GM_setValue(CONFIG.PROMPT_STORAGE + '_' + currentLangKey, JSON.stringify(promptData));
                alert(langDict.msg_save_ok);
            } else {
                alert(langDict.msg_key_err);
            }
        });
    }

    // 显示总结结果
    function showSummary(contentDiv, summary) {
        if (loadingTimerInterval) clearInterval(loadingTimerInterval);
        contentDiv.textContent = '';

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'gemini-summary';

        const lines = summary.split('\n');
        let currentList = null;

        // 核心安全解析器：纯 DOM 节点生成
        function parseContent(container, text) {
            const parts = text.split(/(\*\*.+?\*\*|\b\d{1,2}:\d{2}(?::\d{2})?\b)/g);
            parts.forEach(part => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    const strong = document.createElement('strong');
                    strong.textContent = part.slice(2, -2);
                    container.appendChild(strong);
                } else if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(part)) {
                    const span = document.createElement('span');
                    span.className = 'gemini-time-text';
                    span.textContent = part;
                    container.appendChild(span);
                } else if (part.trim()) {
                    const span = document.createElement('span');
                    span.className = 'gemini-chapter-text';
                    span.textContent = part;
                    container.appendChild(span);
                }
            });
        }

        lines.forEach(line => {
            if (line.startsWith('### ')) {
                const h3 = document.createElement('h3');
                parseContent(h3, line.substring(4));
                summaryDiv.appendChild(h3);
                currentList = null;
            } else if (line.startsWith('- ')) {
                if (!currentList) {
                    currentList = document.createElement('ul');
                    summaryDiv.appendChild(currentList);
                }
                const li = document.createElement('li');

                const cleanLine = line.substring(2).replace(/\[|\]/g, '');

                const timeMatch = cleanLine.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
                if (timeMatch) {
                    li.className = 'gemini-chapter-item';
                    li.dataset.timestamp = timeMatch[0];
                }

                parseContent(li, cleanLine);
                currentList.appendChild(li);
            } else if (line.trim()) {
                const p = document.createElement('p');
                parseContent(p, line);
                summaryDiv.appendChild(p);
                currentList = null;
            }
        });

        contentDiv.appendChild(summaryDiv);
    }

    // 显示错误信息
    function showError(contentDiv, error) {
        if (loadingTimerInterval) clearInterval(loadingTimerInterval);
        contentDiv.textContent = '';

        const errorDiv = document.createElement('div');
        errorDiv.className = 'gemini-error';

        const title = document.createElement('strong');
        title.textContent = getLang().error_title;
        errorDiv.appendChild(title);

        const messageDiv = document.createElement('div');
        messageDiv.className = 'gemini-error-msg';
        messageDiv.textContent = error.message;
        errorDiv.appendChild(messageDiv);

        if (error.message.includes('API') || error.message.includes('key') || error.message.includes('KEY')) {
            const tipDiv = document.createElement('div');
            tipDiv.className = 'gemini-error-tip';
            tipDiv.textContent = getLang().error_api_key;
            errorDiv.appendChild(tipDiv);
        } else if (error.message.includes('Quota') || error.message.includes('limit') || error.message.includes('429')) {
            const tipDiv = document.createElement('div');
            tipDiv.className = 'gemini-error-tip';
            tipDiv.textContent = getLang().error_quota;
            errorDiv.appendChild(tipDiv);
        }

        contentDiv.appendChild(errorDiv);
    }

    // 显示加载状态
    function showLoading(contentDiv) {
        contentDiv.textContent = '';

        const loading = document.createElement('div');
        loading.className = 'gemini-loading';

        const spinner = document.createElement('div');
        spinner.className = 'gemini-spinner';

        const text = document.createElement('div');
        text.textContent = getLang().msg_loading;

        const timerDisplay = document.createElement('div');
        timerDisplay.style.cssText = 'font-size: 13px; color: var(--gs-text-muted); margin-top: -10px;';
        timerDisplay.textContent = getLang().thinking_start;

        loading.appendChild(spinner);
        loading.appendChild(text);
        loading.appendChild(timerDisplay);
        contentDiv.appendChild(loading);

        let seconds = 0;
        if (loadingTimerInterval) clearInterval(loadingTimerInterval);
        loadingTimerInterval = setInterval(() => {
            seconds++;
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            timerDisplay.textContent = getLang().thinking_timer.replace('{m}', m).replace('{s}', s);
        }, 1000);
    }

    // 主处理函数
    async function handleSummarize(sidebar) {
        const contentDiv = sidebar.querySelector('#gemini-summary-content');
        const apiKey = getApiKey();

        if (!apiKey) {
            showSettings(contentDiv);
            return;
        }

        const { videoId, videoUrl } = getVideoInfo();

        if (!videoId) {
            showError(contentDiv, new Error('无法获取视频 ID'));
            return;
        }

        // 检测到切换了新视频，立刻把旧字幕数据炸掉
        if (sidebar.dataset.currentVideoId !== videoId) {
            // 改为选中 transcript-list
            const transcriptList = sidebar.querySelector('#gemini-transcript-list');
            if (transcriptList) {
                delete transcriptList.dataset.loaded;
                transcriptList.textContent = '';
            }
            const translateBtn = sidebar.querySelector('.gemini-translate-btn');
            if (translateBtn) {
                translateBtn.classList.remove('cancel');
                translateBtn.textContent = getLang().btn_trans;
            }
            // 清空聊天内容
            const chatContent = sidebar.querySelector('.gemini-chat-content');
            if (chatContent) {
                chatContent.replaceChildren();
            }

            // 通过 sidebar 重新查找输入框和清除按钮
            const chatInput = sidebar.querySelector('.gemini-chat-input');
            const chatClearTextBtn = sidebar.querySelector('.gemini-chat-clear-text');
            if (chatInput) {
                chatInput.value = getLang().chat_default_q;
                chatInput.style.height = '36px';
                if (chatClearTextBtn) chatClearTextBtn.style.display = 'flex';
            }

            sidebar.dataset.currentVideoId = videoId;
        }

        if (summaryCache.has(videoId)) {
            console.log('[Gemini Summarizer] Using cached summary for video:', videoId);
            const cachedSummary = summaryCache.get(videoId);
            showSummary(contentDiv, cachedSummary);
            sidebar.dataset.currentSummary = cachedSummary;
            return;
        }

        if (isRequesting) {
            return;
        }

        showLoading(contentDiv);
        isRequesting = true;

        try {
            const summary = await callGeminiAPI(videoUrl, apiKey);
            showSummary(contentDiv, summary);
            sidebar.dataset.currentSummary = summary;
            summaryCache.set(videoId, summary);
            console.log('[Gemini Summarizer] Summary cached for video:', videoId);
        } catch (error) {
            showError(contentDiv, error);
        } finally {
            isRequesting = false;
        }
    }

    // ==================== 初始化与按钮挂载 ====================

    function tryInjectButton() {
        if (document.querySelector('.gemini-summarizer-btn')) {
            return;
        }

        const { videoId } = getVideoInfo();
        if (!videoId) return;

        // 兼容 YouTube 桌面端新旧版，以及手机端原生横向滑动栏
        const targets = [
            'ytd-watch-metadata ytd-menu-renderer #top-level-buttons-computed', // 桌面端新版
            '#top-level-buttons-computed', // 桌面端旧版
            'ytm-slim-video-action-bar-renderer > div', // 手机端最新版 (横向滑动栏容器)
            '.slim-video-action-bar-actions', // 手机端最新版备用
            '.slim-video-metadata-actions', // 手机端旧版
            'ytm-slim-video-metadata-section-renderer .slim-video-metadata-actions' // 手机端旧版备用
        ];

        let target = null;
        for (const selector of targets) {
            const el = document.querySelector(selector);
            if (el) {
                target = el;
                break;
            }
        }

        if (target) {
            console.log('[Gemini Summarizer] Target found:', target);

            const summarizeBtn = createSummarizeButton();

           // 响应式按钮样式：如果在手机端，对按钮进行防挤压和放大处理
            if (window.location.hostname === 'm.youtube.com' || window.innerWidth < 800) {
                summarizeBtn.style.padding = '0 16px';
                summarizeBtn.style.fontSize = '15px';
                summarizeBtn.style.fontWeight = '500';
                summarizeBtn.style.height = '36px';
                summarizeBtn.style.flexShrink = '0';
                summarizeBtn.style.margin ='0 8px';

                const svg = summarizeBtn.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '20');
                    svg.setAttribute('height', '20');
                }
            }

            // 双端通用的智能定位：寻找“分享”按钮并插在它前面
            let insertBeforeEl = null;
            for (let i = 0; i < target.children.length; i++) {
                const text = target.children[i].textContent || '';
                if (text.includes('分享') || text.includes('Share') || text.includes('共有')) {
                    insertBeforeEl = target.children[i];
                    break;
                }
            }

            if (insertBeforeEl) {
                target.insertBefore(summarizeBtn, insertBeforeEl); // 精准插在“分享”前面
            } else if (target.children.length >= 2) {
                target.insertBefore(summarizeBtn, target.children[1]); // 兜底：强行插在第2个位置
            } else {
                target.appendChild(summarizeBtn); // 最终兜底：放在最后
            }
            // -----------------------------------------------------------

            let sidebar = document.querySelector('.gemini-sidebar');
            if (!sidebar) {
                sidebar = createSidebar();

                sidebar.querySelector('.gemini-close-btn').addEventListener('click', () => {
                    sidebar.classList.remove('active');
                });

                sidebar.querySelector('.gemini-copy-btn').addEventListener('click', () => {
                    const summary = sidebar.dataset.currentSummary;
                    if (summary) {
                        navigator.clipboard.writeText(summary).then(() => {
                            const btn = sidebar.querySelector('.gemini-copy-btn');
                            const originalText = btn.textContent;
                            btn.textContent = '✓ ' + getLang().bubble_copied;
                            setTimeout(() => {
                                btn.textContent = originalText;
                            }, 2000);
                        });
                    }
                });

            }

            summarizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                sidebar.classList.add('active');
                handleSummarize(sidebar);
            });

            console.log('[Gemini Summarizer] Button injected successfully.');
        }
    }

    function init() {
        console.log('[Gemini Summarizer] Initializing...');

        injectStyles();
        tryInjectButton();

        let timeout = null;
        const observer = new MutationObserver((mutations) => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                tryInjectButton();
            }, 500);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('yt-navigate-finish', () => {
            console.log('[Gemini Summarizer] Navigation finished');
            // 清理上一条视频的字幕缓存
            // 改为选中 transcript-list
            const transcriptList = document.getElementById('gemini-transcript-list');
            if (transcriptList) {
                delete transcriptList.dataset.loaded;
                transcriptList.textContent = '';
            }
            // 清理上一条视频的提问对话记录缓存
            const chatContent = document.querySelector('.gemini-chat-content');
            if (chatContent) {
                chatContent.replaceChildren();
            }
            const chatInput = document.querySelector('.gemini-chat-input');
            const chatClearTextBtn = document.querySelector('.gemini-chat-clear-text');
            if (chatInput) {
                chatInput.value = getLang().chat_default_q;
                if (chatClearTextBtn) chatClearTextBtn.style.display = 'flex';
            }
            setTimeout(tryInjectButton, 1000);
        });

        window.addEventListener('spfdone', () => {
            setTimeout(tryInjectButton, 1000);
        });
    }

    // 启动脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
