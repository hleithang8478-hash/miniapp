const recorderManager = wx.getRecorderManager();

Page({
  data: {
    apiKey: 'sk-deeb179955924172b2dd663e62f66e6d',
    isRecording: false,
    recordTime: 0,
    recordTimeStr: '00:00',
    timer: null,
    
    originalText: '',
    aiResult: '',
    isProcessing: false,
    loadingText: ''
  },

  onLoad() {
    recorderManager.onStop((res) => {
      console.log('原生录音文件地址：', res.tempFilePath);
      this.setData({ isRecording: false, loadingText: '正在调用腾讯云 16k 引擎识别...' });
      this.runServiceASR(res.tempFilePath);
    });

    recorderManager.onError((err) => {
      console.error('录音失败', err);
      this.stopTimer();
      this.setData({ isRecording: false, isProcessing: false });
    });
  },

  toggleRecord() {
    if (this.data.isRecording) {
      recorderManager.stop();
      this.stopTimer();
      this.setData({ isProcessing: true }); 
    } else {
      wx.authorize({
        scope: 'scope.record',
        success: () => {
          this.setData({ 
            originalText: '', aiResult: '', isRecording: true,
            recordTime: 0, recordTimeStr: '00:00'
          });
          this.startTimer();
          
          // 🌟🌟🌟 核心保命修改：强制匹配腾讯云 16k_zh 引擎的物理参数！！！
          recorderManager.start({ 
            duration: 60000,
            format: 'mp3',
            sampleRate: 16000,      // 强制 16000Hz 采样率
            numberOfChannels: 1,    // 强制单声道
            encodeBitRate: 48000    // 匹配 16k 的比特率
          }); 
        },
        fail: () => {
          wx.showModal({ title: '权限拒绝', content: '请在右上角设置中开启麦克风权限', showCancel: false });
        }
      });
    }
  },

  startTimer() {
    this.data.timer = setInterval(() => {
      let time = this.data.recordTime + 1;
      let min = Math.floor(time / 60).toString().padStart(2, '0');
      let sec = (time % 60).toString().padStart(2, '0');
      this.setData({ recordTime: time, recordTimeStr: `${min}:${sec}` });
    }, 1000);
  },

  stopTimer() {
    if (this.data.timer) clearInterval(this.data.timer);
  },

  onOriginalInput(e) {
    this.setData({ originalText: e.detail.value });
  },

  // ==========================================
  // 核心 1：调用微信服务市场 ASR
  // ==========================================
  async runServiceASR(filePath) {
    try {
      const res = await wx.serviceMarket.invokeService({
        service: 'wxa8386175898e12c9',
        api: 'SentenceASR',            
        data: {
          Action: "SentenceRecognitionWX",
          EngSerViceType: "16k_zh",    
          SourceType: 0,               // 用回官方推荐的 URL 模式
          Url: new wx.serviceMarket.CDN({ type: 'filePath', filePath: filePath }),
          UsrAudioKey: Math.random().toString(36).substring(2, 10), 
          VoiceFormat: "mp3"           
        }
      });
      
      console.log("ASR 返回数据:", res.data);

      let text = '';
      let errorMsg = '';

      if (res.data && res.data.Result) text = res.data.Result;
      else if (res.data && res.data.Response && res.data.Response.Result) text = res.data.Response.Result;
      else if (res.data && res.data.text) text = res.data.text;

      if (!text) {
        if (res.data && res.data.Error) errorMsg = res.data.Error.Message;
        else if (res.data && res.data.Response && res.data.Response.Error) errorMsg = res.data.Response.Error.Message;
        else errorMsg = '识别结果为空，返回原始报文:' + JSON.stringify(res.data).substring(0, 50);
        throw new Error(errorMsg);
      }

      this.setData({ originalText: text, isProcessing: false, loadingText: '' });
      wx.showToast({ title: '转写成功！', icon: 'success' });

    } catch (err) {
      console.error('ASR 识别失败', err);
      this.setData({ isProcessing: false, loadingText: '' });
      wx.showModal({ title: '语音识别异常', content: err.message, showCancel: false });
    }
  },

  // ==========================================
  // 核心 2：调用 DeepSeek
  // ==========================================
  doAIPolish() {
    const { originalText, apiKey } = this.data;
    if (!originalText) return wx.showToast({ title: '请先录音', icon: 'none' });

    this.setData({ isProcessing: true, loadingText: 'DeepSeek 正在撰写评课稿...' });

    wx.request({
      url: 'https://api.deepseek.com/chat/completions',
      method: 'POST',
      header: { 'Authorization': 'Bearer ' + apiKey },
      data: {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一位资深的中学地理教研员。请根据我提供的“听课原声转写文本”，将其转化为一份专业的《地理听评课报告》。\n要求：\n1. 包含：【教学亮点】、【教学不足】、【改进建议】三部分。\n2. 使用专业的地理教学名词（如：核心素养、人地协调观等）。\n3. 文本排版清晰，直接输出正文，不要有任何多余的寒暄。" },
          { role: "user", content: originalText }
        ],
        temperature: 0.3
      },
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ aiResult: res.data.choices[0].message.content, isProcessing: false, loadingText: '' });
          wx.vibrateShort();
        } else {
          this.setData({ isProcessing: false, loadingText: '' });
          wx.showModal({ title: 'AI 生成失败', content: '请检查接口' });
        }
      },
      fail: () => {
        this.setData({ isProcessing: false, loadingText: '' });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  copyResult() {
    if (!this.data.aiResult) return;
    wx.setClipboardData({
      data: this.data.aiResult,
      success: () => { wx.showToast({ title: '报告已复制', icon: 'success' }); }
    });
  }
});