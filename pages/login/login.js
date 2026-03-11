Page({
  data: { password: '' },
  onInput(e) { 
    const val = e.detail.value;
    this.setData({ password: val });
    if(val.length === 4) this.checkLogin();
  },
  checkLogin() {
    if (this.data.password === "8888") { 
      wx.showToast({ title: '身份已确认', icon: 'success' });
      setTimeout(() => { wx.reLaunch({ url: '/pages/menu/menu' }); }, 500);
    } else if (this.data.password.length === 4) {
      wx.showToast({ title: '授权码错误', icon: 'error' });
      this.setData({ password: '' });
    }
  }
})