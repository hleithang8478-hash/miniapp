Page({
  data: {
    apiKey: 'sk-deeb179955924172b2dd663e62f66e6d', // 您的 DeepSeek Key
    imageUrl: '',          // 选中的试卷图片路径
    isProcessing: false,   // 是否正在处理中
    loadingText: '',       // 加载提示语
    questions: [],         // AI 切片后的题目列表
    selectedCount: 0       // 已勾选的题目数量
  },

  // 1. 拍照或选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ 
          imageUrl: tempFilePath,
          questions: [], 
          selectedCount: 0,
          isProcessing: true,
          loadingText: '正在提取图片文字 (OCR)...'
        });
        
        try {
          // 第一步：调用您已经配置好的微信 OCR 服务
          const rawText = await this.runServiceOCR(tempFilePath);
          
          if (!rawText || rawText.trim() === '') {
            throw new Error('未能从图片中识别出有效文字，请重新拍照');
          }

          this.setData({ loadingText: '文字提取成功，DeepSeek 正在进行智能切片...' });

          // 第二步：将识别的原始乱码文字发给 DeepSeek 进行结构化切片
          await this.doAISlicing(rawText);

        } catch (error) {
          console.error(error);
          this.setData({ isProcessing: false });
          wx.showModal({
            title: '处理失败',
            content: error.message || '识别或切片过程中发生错误，请重试',
            showCancel: false
          });
        }
      }
    });
  },

  // 调用您在 index.js 中跑通的腾讯 OCR 服务
  runServiceOCR(path) {
    return new Promise((resolve, reject) => {
      wx.serviceMarket.invokeService({
        service: 'wx79ac3de8be320b71',
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

  // 调用 DeepSeek 进行结构化切片
  doAISlicing(rawText) {
    return new Promise((resolve, reject) => {
      // 这里的系统提示词非常关键：强制它扮演老师，并严格输出 JSON 数组
      const systemMsg = `你是一个专业的初中地理试卷解析专家。
我将提供一段由 OCR 识别的试卷原始文本（可能排版杂乱、有错别字）。
请你将这段文本“切片”成独立的题目，自动修正明显的 OCR 识别错误。
【严格要求】：
请直接输出一个严格的 JSON 数组格式，绝对不能包含任何其他文本、解释或 Markdown 代码块标识（不要输出 \`\`\`json 这样的符号，直接以 [ 开头，] 结尾）。
数组中每个对象必须包含以下字段：
- id: 题号（如 "q1", "q2"）
- type: 题型（"单选题", "多选题" 或 "综合题"）
- tags: 知识点标签，数组格式（如 ["洋流", "气候"]），最多2个核心标签。
- content: 完整的题目内容，包含题干和所有选项。要求排版整洁，选项换行对齐，不要改变原题意。

示例输出：
[
  {
    "id": "q1",
    "type": "单选题",
    "tags": ["地球自转", "时间计算"],
    "content": "1. 引起昼夜交替现象的根本原因是：\\nA. 地球自转\\nB. 地球公转\\nC. 太阳活动\\nD. 地壳运动"
  }
]`;

      wx.request({
        url: 'https://api.deepseek.com/chat/completions',
        method: 'POST',
        header: { 'Authorization': 'Bearer ' + this.data.apiKey },
        data: {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: rawText }
          ],
          temperature: 0.1 // 降低温度，让模型输出更严谨、格式更稳定
        },
        success: (res) => {
          if (res.statusCode === 200) {
            let resultText = res.data.choices[0].message.content.trim();
            
            // 兼容处理：以防模型还是不听话带了 markdown 标记
            if (resultText.startsWith('```json')) {
              resultText = resultText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (resultText.startsWith('```')) {
              resultText = resultText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            try {
              // 将 DeepSeek 返回的 JSON 字符串解析为数组
              const questionsArray = JSON.parse(resultText);
              
              // 给每个题目加上 selected: false 的初始状态
              const formattedQuestions = questionsArray.map(q => ({
                ...q,
                selected: false
              }));

              this.setData({
                questions: formattedQuestions,
                isProcessing: false
              });
              wx.vibrateShort();
              wx.showToast({ title: 'AI 切片完成', icon: 'success' });
              resolve();

            } catch (e) {
              console.error("JSON 解析失败，DeepSeek 返回内容:", resultText);
              reject(new Error('AI 返回的数据格式异常，未能成功解析题目。'));
            }
          } else {
            reject(new Error('DeepSeek API 请求失败，状态码: ' + res.statusCode));
          }
        },
        fail: () => {
          reject(new Error('网络请求异常，请检查网络设置。'));
        }
      });
    });
  },

  // 3. 切换题目的勾选状态
  toggleSelect(e) {
    const id = e.currentTarget.dataset.id;
    let questions = this.data.questions;
    let count = 0;

    questions.forEach(item => {
      if (item.id === id) {
        item.selected = !item.selected;
      }
      if (item.selected) count++;
    });

    this.setData({
      questions: questions,
      selectedCount: count
    });
  },

  // 4. 导出 Word 纯净版
  exportToWord() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请先勾选题目', icon: 'none' });
      return;
    }

    const selectedQ = this.data.questions.filter(q => q.selected);
    let documentText = "【地理名师 AI 工作站 - 专属错题集】\n\n";
    selectedQ.forEach((q, index) => {
      documentText += `第 ${index + 1} 题 [${q.tags.join(' ')}]\n${q.content}\n\n`;
    });

    wx.setClipboardData({
      data: documentText,
      success: () => {
        wx.showModal({
          title: '组卷成功',
          content: '纯净版题目已由 AI 整理好并复制到您的手机剪贴板，您可以直接去微信粘贴发送给文件传输助手或电脑！',
          showCancel: false,
          confirmText: '太棒了',
          confirmColor: '#00bcd4'
        });
      }
    });
  }
});