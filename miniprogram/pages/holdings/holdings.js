const { fetchEstimate } = require('../../utils/fundApi');
const { getHoldings, addHolding, removeHolding } = require('../../utils/storage');

Page({
  data: {
    holdings: [],
    formCode: '',
    formShares: '',
    formCost: '',
    formError: '',
    editingCode: '',
    submitting: false,
  },

  onShow() {
    this.setData({ holdings: getHoldings() });
  },

  onInputCode(e) {
    this.setData({ formCode: e.detail.value });
  },

  onInputShares(e) {
    this.setData({ formShares: e.detail.value });
  },

  onInputCost(e) {
    this.setData({ formCost: e.detail.value });
  },

  startEdit(e) {
    const code = e.currentTarget.dataset.code;
    const item = this.data.holdings.find((h) => h.fundCode === code);
    if (!item) return;
    this.setData({
      editingCode: code,
      formCode: item.fundCode,
      formShares: String(item.shares),
      formCost: String(item.costNav),
      formError: '',
    });
  },

  cancelEdit() {
    this.setData({ editingCode: '', formCode: '', formShares: '', formCost: '', formError: '' });
  },

  validateForm() {
    const { formCode, formShares, formCost } = this.data;
    if (!/^\d{6}$/.test(formCode)) return '请输入正确的6位基金代码';
    const shares = parseFloat(formShares);
    if (!formShares || isNaN(shares) || shares <= 0) return '请输入有效的持有份额';
    const cost = parseFloat(formCost);
    if (!formCost || isNaN(cost) || cost <= 0) return '请输入有效的成本净值';
    return '';
  },

  handleSubmit() {
    const error = this.validateForm();
    if (error) {
      this.setData({ formError: error });
      return;
    }
    this.setData({ formError: '', submitting: true });

    const { formCode, formShares, formCost, editingCode } = this.data;

    const finish = (fundName) => {
      addHolding({
        fundCode: formCode,
        fundName: fundName || formCode,
        shares: parseFloat(formShares),
        costNav: parseFloat(formCost),
      });
      this.setData({
        holdings: getHoldings(),
        formCode: '',
        formShares: '',
        formCost: '',
        editingCode: '',
        submitting: false,
      });
      my.showToast({ type: 'success', content: editingCode ? '已保存' : '已添加' });
    };

    if (editingCode) {
      const existing = this.data.holdings.find((h) => h.fundCode === editingCode);
      finish(existing ? existing.fundName : formCode);
      return;
    }

    fetchEstimate(formCode)
      .then((est) => finish(est.name))
      .catch(() => {
        this.setData({ submitting: false, formError: '未查询到该基金，请确认代码是否正确' });
      });
  },

  handleDelete(e) {
    const code = e.currentTarget.dataset.code;
    my.confirm({
      title: '确认删除',
      content: '删除后需重新添加该持仓',
      success: (res) => {
        if (res.confirm) {
          this.setData({ holdings: removeHolding(code) });
        }
      },
    });
  },

  goBack() {
    my.navigateBack();
  },
});
