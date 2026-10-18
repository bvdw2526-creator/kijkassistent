// Controleert of elke t('sleutel')-aanroep in de code bestaat in messages/nl.json en messages/en.json.
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..')
const nl = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/nl.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf8'))

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

let problems = 0
let calls = 0
for (const file of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]) {
  const src = fs.readFileSync(file, 'utf8')
  const vars = {}
  for (const m of src.matchAll(/const (\w+) = (?:useTranslations|await getTranslations)\('(\w+)'\)/g)) vars[m[1]] = m[2]
  for (const [v, ns] of Object.entries(vars)) {
    const re = new RegExp(`\\b${v}(?:\\.rich)?\\('([\\w]+)'`, 'g')
    for (const m of src.matchAll(re)) {
      calls++
      const key = m[1]
      for (const [name, json] of [['nl', nl], ['en', en]]) {
        if (!json[ns] || json[ns][key] === undefined) {
          problems++
          console.log(`${path.relative(ROOT, file)}: ${ns}.${key} ontbreekt in ${name}`)
        }
      }
    }
  }
}
// Zelfde sleutels in beide talen?
for (const ns of new Set([...Object.keys(nl), ...Object.keys(en)])) {
  for (const k of new Set([...Object.keys(nl[ns] || {}), ...Object.keys(en[ns] || {})])) {
    if (!(nl[ns] && k in nl[ns]) || !(en[ns] && k in en[ns])) {
      problems++
      console.log(`${ns}.${k} staat maar in één taal`)
    }
  }
}
console.log(`${calls} vaste aanroepen gecontroleerd, ${problems} problemen`)
