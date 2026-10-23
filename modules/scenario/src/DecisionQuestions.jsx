import React from 'react';

export function DecisionQuestions({ decision, answers, onAnswer, onClarify, busy }) {
  const questions = decision.questions || [];
  const answered = questions.some(q => answers[q.id]?.trim());
  return <div className="decision-support">
    {questions.length ? <section className="decision-questions" aria-label="关键追问">
      <span className="eyebrow">让候选更贴近需求</span><h3>先确认这 {questions.length} 件事</h3>
      <p>这些回答会影响产品选择。暂不清楚也可以先写有限草稿，不会补造条件。</p>
      {questions.map(q => <div className="decision-question" key={q.id}>
        <label htmlFor={'decision-' + q.id}>{q.question}</label>
        <p className="fine">{q.why}</p>
        <input id={'decision-' + q.id} value={answers[q.id] || ''} maxLength={400} disabled={busy}
          placeholder="填写实际情况；不知道可写暂不清楚" onChange={e => onAnswer(q.id, e.target.value)}/>
      </div>)}
      {answered ? <p className="warning" role="status">已填写的回答尚未用于匹配，请先点击“根据回答更新候选”，再生成文案。清空回答可继续按已知信息生成。</p> : null}
      <button className="primary" disabled={busy || !answered} onClick={() => onClarify(questions, answers)}>根据回答更新候选</button>
    </section> : null}
    {decision.exclusions?.length ? <details className="decision-exclusions"><summary>已排除 {decision.exclusions.length} 个不满足明确条件的产品</summary>
      {decision.exclusions.map((item, i) => <p key={i}><strong>{item.name}</strong>：{item.reason}</p>)}
    </details> : null}
  </div>;
}
