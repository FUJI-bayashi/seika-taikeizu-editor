/* 質問・選択肢・組織・線種はこのファイルで管理します。外部通信は行いません。 */
(function (root) {
  'use strict';
  const yesNo = [{ value: true, label: 'はい' }, { value: false, label: 'いいえ' }];
  const exists = [{ value: true, label: '有' }, { value: false, label: '無' }];
  const salesLeadershipOptions = [
    { value: 'g-and-member', label: 'G・会員営業主導' },
    { value: 'g', label: 'G営業主導' },
    { value: 'member', label: '会員営業主導' }
  ];
  const data = {
    salesLeadershipOptions,
    sections: ['案件情報', '営業・提携', '組織情報'],
    questions: [
      { id: 'orderType', number: 'Q4', title: '発注区分', type: 'select', section: 0, options: ['公共', '民間'] },
      { id: 'caseType', number: 'Q1', title: '案件区分', type: 'select', section: 0, options: ['B1（設計織込）', 'B1（入札前技術提案）', 'B2（追加協議）'] },
      { id: 'contributionOrganization', number: 'Q2', title: '貢献組織', type: 'text', section: 0, help: '入力した内容をタイトルの括弧内に表示します。Gの入力は任意です。' },
      { id: 'myNumber', number: 'Q3', title: 'マイナンバー', type: 'integer', section: 0 },
      { id: 'recordNumber', number: 'Q3', title: 'レコード番号', type: 'integer', section: 0 },
      { id: 'projectName', title: '案件名', type: 'text', section: 0 },
      { id: 'salesLeadership', number: 'Q5', title: '営業主導', type: 'select', section: 1, options: salesLeadershipOptions },
      { id: 'primaryIsPartner', number: 'Q6', title: '一次が業務提携会社か', type: 'select', section: 1, options: yesNo },
      { id: 'externalPartnerExists', number: 'Q7', title: '施工体制に入らない業務提携会社', type: 'select', section: 1, options: exists },
      { id: 'memberInfoLedToContract', number: 'Q8', title: '会員が情報提供して成約した', type: 'select', section: 1, options: yesNo },
      { id: 'contractorName', number: 'Q8-1', title: 'その施工会社名', type: 'text', section: 1, visibleWhen: { field: 'memberInfoLedToContract', equals: true } },
      { id: 'steelPartnerInvolved', number: 'Q9', title: '業務提携関係にある鋼材商社の関与', type: 'select', section: 1, options: exists },
      { id: 'twoFillingMembers', number: 'Q10', title: '充填会員が二社ある', type: 'select', section: 1, options: exists },
      { id: 'executionRightHolderRemoved', number: 'Q11', title: '元請の意向で施工体制から施工権を持つ組織が外れた', type: 'select', section: 1, options: yesNo }
    ],
    organizations: [
      ...['事業主体', '元請', '鋼材商社', '杭会社', '一次', '二次', '三次', '四次'].map((role, i) => ({ id: `org${i + 1}`, role, lane: 'middle', shape: i >= 3 ? 'ellipse' : 'rect' })),
      { id: 'consultant', role: 'コンサル', lane: 'upper', shape: 'rect' },
      { id: 'designer', role: '設計会社', lane: 'upper', shape: 'rect' }
    ],
    edgeTypes: [
      { id: 'black-solid', name: '黒実線', color: '#111111', labels: [{ id: 'none', text: 'なし' }, { id: 'material-work', text: '材工' }, { id: 'material', text: '材' }, { id: 'work', text: '工' }, { id: 'custom', text: '自由入力', extra: 'text' }] },
      { id: 'black-multiple', name: '黒多重線', color: '#111111', labels: [{ id: 'custom', text: '自由入力', extra: 'text' }] },
      { id: 'red-dashed-arrow', name: '赤点線矢印・見積', color: '#ff0000', dashed: true, arrow: true, labels: [{ id: 'estimate-material-work', text: '見積（材工）' }, { id: 'estimate-material', text: '見積（材）' }, { id: 'estimate-work', text: '見積（工）' }] },
      { id: 'red-solid-arrow', name: '赤実線矢印・支払', color: '#ff0000', arrow: true, labels: [{ id: 'fee', text: '営業フィー' }, { id: 'discount', text: '営業値引き●％として材を支払い', extra: 'percent' }, { id: 'custom', text: '自由入力', extra: 'text' }] },
      { id: 'blue-dashed-arrow', name: '青点線矢印・営業', color: '#0080ef', dashed: true, arrow: true, labels: [
        { id: 'explain', text: '●による工法説明', extra: 'name' },
        { id: 'awareness', text: '●による工法認知活動', extra: 'name' },
        { id: 'support', text: '●による営業サポート', extra: 'name' },
        { id: 'sales-follow', text: '●による営業フォロー', extra: 'name' },
        { id: 'change', text: '追加変更提案' }, { id: 'follow', text: '営業フォロー' }, { id: 'custom', text: '自由入力', extra: 'text' }
      ] }
    ]
  };
  root.DiagramData = data;
})(globalThis);

