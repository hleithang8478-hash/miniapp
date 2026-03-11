if (typeof global === 'undefined') { var global = {}; }
global.cpexcel = {}; 
const XLSX = require('../../libs/xlsx'); 

Page({
  data: {
    step: 1,
    files: [], 
    mainIndex: 0,
    keyField: '', 
    // 【核心补丁：为前端准备的扁平化一维数组，专治各种不刷新】
    currentMainHeaders: [], 
    mappings: [{ sourceFileIdx: -1, source: '', target: '', currentSourceHeaders: [] }], 
    handleType: 'empty',
    previewList: [],
    previewHeaders: [],
    resultData: null,
    loading: false
  },

  // 1. 强力解析
  chooseFiles() {
    wx.chooseMessageFile({
      count: 3,
      type: 'file',
      extension: ['.xlsx', '.xls'],
      success: async (res) => {
        this.setData({ loading: true });
        const parsedFiles = [];
        const fs = wx.getFileSystemManager();
        
        for (let file of res.tempFiles) {
          try {
            const buffer = fs.readFileSync(file.path);
            const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            // 加上 defval:""，确保第一行如果有空单元格，列名也不会丢
            const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            
            if (json.length > 0) {
              let rawHeaders = Object.keys(json[0]);
              let cleanHeaders = rawHeaders.map(h => String(h).replace(/\s+/g, ""));
              
              let cleanData = json.map(row => {
                let newRow = {};
                rawHeaders.forEach((h, i) => { newRow[cleanHeaders[i]] = row[h]; });
                return newRow;
              });
              
              parsedFiles.push({ name: file.name, data: cleanData, headers: cleanHeaders });
            }
          } catch (err) { console.error(err); }
        }
        
        if (parsedFiles.length >= 2) {
          this.setData({ files: parsedFiles, loading: false });
          wx.showToast({ title: '载入成功', icon: 'success' });
        } else {
          this.setData({ loading: false });
          wx.showModal({ title: '提示', content: '请至少选择两个表', showCancel: false });
        }
      }
    });
  },

  // 2. 初始化配置参数，强刷扁平数组
  toStep2() {
    let mainHeaders = this.data.files[this.data.mainIndex].headers;
    let defaultSourceIdx = this.data.mainIndex === 0 ? 1 : 0;
    let sourceHeaders = this.data.files[defaultSourceIdx].headers;

    this.setData({ 
      step: 2, 
      currentMainHeaders: mainHeaders, // 直接喂一维数组
      "mappings[0].sourceFileIdx": defaultSourceIdx,
      "mappings[0].currentSourceHeaders": sourceHeaders // 附表字段也独立喂
    });
  },

  mainTableChange(e) {
    let idx = parseInt(e.detail.value);
    let defaultSourceIdx = idx === 0 ? 1 : 0;
    let newMainHeaders = this.data.files[idx].headers;
    let newSourceHeaders = this.data.files[defaultSourceIdx].headers;

    this.setData({ 
      mainIndex: idx, 
      keyField: '', 
      currentMainHeaders: newMainHeaders, // 强刷主表列
      mappings: [{ sourceFileIdx: defaultSourceIdx, source: '', target: '', currentSourceHeaders: newSourceHeaders }] 
    });
  },

  keyFieldChange(e) { 
    this.setData({ keyField: this.data.currentMainHeaders[e.detail.value] }); 
  },

  // --- 连线映射管理 ---
  addMapping() {
    let sIdx = this.data.mainIndex === 0 ? 1 : 0;
    this.setData({ 
      mappings: [...this.data.mappings, { 
        sourceFileIdx: sIdx, 
        source: '', 
        target: '', 
        currentSourceHeaders: this.data.files[sIdx].headers 
      }] 
    });
  },

  removeMapping(e) {
    let list = this.data.mappings;
    list.splice(e.currentTarget.dataset.idx, 1);
    this.setData({ mappings: list });
  },

  updateMapping(e) {
    const { type, idx } = e.currentTarget.dataset;
    const val = parseInt(e.detail.value);
    let m = this.data.mappings;
    
    if (type === 'file') {
      m[idx].sourceFileIdx = val;
      m[idx].source = ''; 
      m[idx].currentSourceHeaders = this.data.files[val].headers; // 切换附表时，立刻强刷附表的列
    } else if (type === 'source') {
      m[idx].source = m[idx].currentSourceHeaders[val];
    } else if (type === 'target') {
      m[idx].target = this.data.currentMainHeaders[val];
    }
    this.setData({ mappings: m });
  },

  // 3. 执行合并算法
  toStep3() {
    const { files, mainIndex, keyField, mappings, handleType } = this.data;
    if (!keyField) return wx.showToast({ title: '请选择关联列', icon: 'none' });
    
    const validMap = mappings.filter(m => m.source && m.target);
    if (validMap.length === 0) return wx.showToast({ title: '请设置连线', icon: 'none' });

    wx.showLoading({ title: '合表中...', mask: true });
    
    let result = JSON.parse(JSON.stringify(files[mainIndex].data));

    result.forEach(row => {
      const idValue = String(row[keyField]).trim(); 
      
      validMap.forEach(m => {
        const sourceFile = files[m.sourceFileIdx];
        const sourceKey = sourceFile.headers.find(h => h === keyField) || sourceFile.headers[0];
        const match = sourceFile.data.find(sr => String(sr[sourceKey]).trim() === idValue);
        
        if (match) {
          row[m.target] = match[m.source];
        } else if (handleType === 'zero') {
          row[m.target] = 0;
        }
      });
    });

    this.setData({ 
      step: 3, 
      previewList: result.slice(0, 8), 
      previewHeaders: Object.keys(result[0]), 
      resultData: result 
    });
    wx.hideLoading();
  },

  executeMerge() { this.setData({ step: 4 }); },

  exportResult() {
    const data = this.data.resultData;
    const h = Object.keys(data[0]);
    const body = data.map(r => h.map(f => r[f]).join('\t')).join('\n');
    wx.setClipboardData({
      data: h.join('\t') + '\n' + body,
      success: () => wx.showModal({ title: '已复制', content: '打开电脑粘贴即可', showCancel: false })
    });
  },

  restart() { this.setData({ step: 1, files: [], keyField: '', currentMainHeaders: [], mappings: [{ sourceFileIdx: -1, source: '', target: '', currentSourceHeaders: [] }] }); }
});