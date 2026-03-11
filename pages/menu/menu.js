Page({
  // 统跳转函数
  navTo(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ 
      url: url,
      fail: (err) => {
        wx.showToast({ title: '页面进入失败', icon: 'none' });
        console.error(err);
      }
    });
  }
})