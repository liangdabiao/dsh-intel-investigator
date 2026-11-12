import test from 'node:test'
import assert from 'node:assert/strict'
import { MODES, MODE_KEYS, resolveMode, buildPlan } from '../lib/modes.js'

test('五种模式齐备且三轮编排完整', () => {
  assert.equal(MODE_KEYS.length, 5)
  for (const [key, mode] of Object.entries(MODES)) {
    assert.equal(mode.rounds.length, 3, `${key} 应有三轮`)
    for (const round of mode.rounds) {
      assert.ok(round.goal && round.engines.length >= 2, `${key}/${round.goal} 引擎编排非空`)
      for (const e of round.engines) assert.ok(e.name && e.query && e.aim)
    }
    assert.ok(mode.dimensions.length >= 4)
    assert.ok(MODES[key].template)
  }
})

test('resolveMode：精确 key → 标签名 → 别名 → null', () => {
  assert.equal(resolveMode('stock'), 'stock')
  assert.equal(resolveMode('A股情报调查'), 'stock')
  assert.equal(resolveMode('帮我调查一下竞品'), 'competitor')
  assert.equal(resolveMode('追踪热点事件'), 'event')
  assert.equal(resolveMode('创始人背景调查'), 'person')
  assert.equal(resolveMode('验证这条消息真实性'), 'verify')
  assert.equal(resolveMode(''), null)
  assert.equal(resolveMode('完全无关'), null)
})

test('buildPlan：subject 替换进关键词模板', () => {
  const plan = buildPlan('stock', '宁德时代')
  assert.ok(plan.includes('宁德时代 基本面 财报 主营业务'))
  assert.ok(plan.includes('site:cninfo.com.cn 宁德时代'))
  assert.ok(plan.includes('A股情报调查'))
  assert.ok(plan.includes('可信度'))
})

test('buildPlan：verify 模式精确匹配引号', () => {
  const plan = buildPlan('verify', '某公司获10亿融资')
  assert.ok(plan.includes('"某公司获10亿融资"'))
  assert.ok(plan.includes('site:gov.cn'))
})

test('buildPlan：未知模式抛错', () => {
  assert.throws(() => buildPlan('nope', 'X'), /未知调查模式/)
})
