Page({
  data: {
    mode: '', modeName: '', lifecycle: 'pre', pageCount: 0, 
    textContent: '', result: '', loadingState: 0, guideInfo: {}, 
    actionName: '',
    apiKey: 'sk-deeb179955924172b2dd663e62f66e6d'
  },

  onLoad(options) {
    const names = { news: '新闻审查', teach: '地理备课', admin: '教研总结' };
    this.setData({ mode: options.mode || 'teach', modeName: names[options.mode || 'teach'] });
    this.updateUI(this.data.mode, this.data.lifecycle);
  },

  setLifecycle(e) { 
    const val = e.currentTarget.dataset.val;
    this.setData({ lifecycle: val, result: '' });
    this.updateUI(this.data.mode, val);
  },

  updateUI(mode, lifecycle) {
    let guide = {};
    let action = "开始分析";
    if (mode === 'teach') {
      if (lifecycle === 'pre') {
        guide = { title: "【课前】新课标教学设计", inputHint: "👉 录入教材正文或大单元要求", outputHint: "✨ 产出: 四维核心素养目标、板书、趣味情境", placeholder: "正在研读教材..." };
        action = '生成教学设计';
      } else if (lifecycle === 'in') {
        guide = { title: "【课中】情境互动与测评", inputHint: "👉 录入教材图表说明或重点段落", outputHint: "✨ 产出: 读图设问、中考难度随堂练、探究活动", placeholder: "正在设计课堂互动..." };
        action = '生成互动方案';
      } else if (lifecycle === 'post') {
        guide = { title: "【课后】双减分层作业", inputHint: "👉 录入今日教学核心点", outputHint: "✨ 产出: 基础+能力+地理实践力作业", placeholder: "正在设计分层作业..." };
        action = '生成分层作业';
      } else if (lifecycle === 'reflect') {
        guide = { title: "【反思】专业教学后记", inputHint: "👉 输入您的课堂真实感受(碎碎念即可)", outputHint: "✨ 产出: 包含成功、不足、改进的反思报告", placeholder: "例如：等高线地形图的闭合曲线学生理解很慢..." };
        action = '撰写教学反思';
      }
    } else if (mode === 'news') {
      guide = { title: "学校宣传稿“三审三校”审查", inputHint: "👉 粘贴或拍摄新闻待审稿", outputHint: "✨ 产出: 修改对照表、规范依据、修正定稿", placeholder: "正在履行审核职责..." };
      action = '执行深度审查';
    } else if (mode === 'admin') {
      guide = { title: "教研活动标准化记录", inputHint: "👉 拍会议笔记或口述要点", outputHint: "✨ 产出: 规范化教研活动简报", placeholder: "正在整理教研材料..." };
      action = '生成教研报告';
    }
    this.setData({ guideInfo: guide, actionName: action });
  },

  // OCR 服务逻辑：基于 CDN 模式
  chooseImage() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        this.setData({ loadingState: 1 });
        const tempFiles = res.tempFiles;
        let allNewText = "";
        for (let i = 0; i < tempFiles.length; i++) {
          wx.showLoading({ title: `识别进度 ${i + 1}/${tempFiles.length}`, mask: true });
          try {
            const text = await this.runServiceOCR(tempFiles[i].tempFilePath);
            if (text) allNewText += (allNewText ? "\n\n" : "") + text;
          } catch (e) { console.error(e); }
        }
        wx.hideLoading();
        this.setData({ 
          textContent: this.data.textContent + (this.data.textContent ? "\n\n---\n\n" : "") + allNewText, 
          pageCount: this.data.pageCount + tempFiles.length,
          loadingState: 0 
        });
      }
    });
  },

  runServiceOCR(path) {
    return new Promise((resolve, reject) => {
      wx.serviceMarket.invokeService({
        service: 'wx79ac3de8be320b71', // 您的服务市场 ID
        api: 'OcrAllInOne',
        data: { 
          img_url: new wx.serviceMarket.CDN({ type: 'filePath', filePath: path }), 
          data_type: 3, 
          ocr_type: 8 
        },
      }).then(res => {
        const items = res.data.ocr_comm_res.items || [];
        resolve(items.map(v => v.text).join('\n'));
      }).catch(err => reject(err));
    });
  },

  doAI() {
    const { mode, lifecycle, textContent, apiKey } = this.data;
    if (!textContent) return;
    this.setData({ loadingState: 2, result: '' });

    let systemMsg = "";
    if (mode === 'news') {
      systemMsg = `你是一位严谨的学校宣传工作负责人。请根据《党政机关公文处理工作条例》及地图管理法规审查文稿，直接输出以下内容：
【1. 政治与规范审查】：检查是否有涉疆涉藏涉台错误、版图描述是否规范。
【2. 礼仪与排位】：检查文中领导姓名及职务是否准确，排名是否符合规范。
【3. 修改对照表】：列出原文错误处、修正建议及依据。
【4. 优化定稿】：输出最终版本。严禁输出任何规章制度大纲！`;
    } else if (mode === 'admin') {
      systemMsg = `你是一位地理教研组长。请将文字转化为《教研活动简报》，包含主题、核心议题、教研结论、后续计划。使用单元教学、核心素养等专业词汇。`;
    } else {
      let base = `你是一位初中地理特级教师。根据素材生成内容：\n\n`;
      if (lifecycle === 'pre') {
        systemMsg = base + `【课前备课全案】：1. 四维核心素养目标；2. 基于真实情境的3分钟导入方案；3. 逻辑结构化板书大纲。直接给教学话术！`;
      } else if (lifecycle === 'in') {
        systemMsg = base + `【课堂互动设计】：1. 针对图表的3个阶梯式提问；2. 两道带解析的中考质感模拟题；3. 一个深度探究话题。`;
      } else if (lifecycle === 'post') {
        systemMsg = base + `【双减分层作业】：1. 基础巩固类；2. 综合能力类；3. 地理实践力类任务。`;
      } else {
        systemMsg = `请根据我的课堂感受，扩写为一篇专业的地理教学反思。包含闪光点、学情诊断、再教改进。要像真人教师写的。`;
      }
    }

    wx.request({
      url: 'https://api.deepseek.com/chat/completions',
      method: 'POST',
      header: { 'Authorization': 'Bearer ' + apiKey },
      data: {
        model: "deepseek-chat",
        messages: [{ role: "system", content: systemMsg }, { role: "user", content: textContent }],
        temperature: 0.4
      },
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ result: res.data.choices[0].message.content, loadingState: 0 });
          wx.vibrateShort();
        } else {
          this.setData({ loadingState: 0 });
          wx.showModal({ title: 'AI 处理异常', content: '请检查 Key 余额' });
        }
      },
      fail: () => { this.setData({ loadingState: 0 }); wx.showToast({ title: '网络异常', icon: 'none' }); }
    });
  },

  onInput(e) { this.setData({ textContent: e.detail.value }); },
  clearAll() { this.setData({ textContent: '', pageCount: 0, result: '' }); },
  copyRes() { wx.setClipboardData({ data: this.data.result }); },
  exportToDocs() {
    wx.setClipboardData({
      data: `【${this.data.actionName}】\n\n${this.data.result}`,
      success: () => wx.showModal({ title: '已同步', content: '打开电脑端腾讯文档 Ctrl+V 即可。', showCancel: false })
    });
  }
})