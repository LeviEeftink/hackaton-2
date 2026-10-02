import assert from 'node:assert/strict'
import { safeReturnPath } from '../src/domain/navigation'

for (const destination of [undefined, null, ['/', '/chauffeur'], '//example.invalid', '/\\example.invalid', '/%5c%5cexample.invalid', '/\n/example.invalid', 'https://example.invalid', 'javascript:alert(1)', 'account']) {
  assert.equal(safeReturnPath(destination), '/', `Ongeldige returnbestemming: ${String(destination)}`)
}
assert.equal(safeReturnPath('/voorstel?route=12'), '/voorstel?route=12')
assert.equal(safeReturnPath('/rit?id=3#route'), '/rit?id=3#route')
assert.equal(safeReturnPath('/account/../chauffeur'), '/chauffeur')
assert.equal(safeReturnPath('/account?next=https%3A%2F%2Fexample.invalid'), '/account?next=https%3A%2F%2Fexample.invalid')
console.log('Veilige navigatie na inloggen: geslaagd')
