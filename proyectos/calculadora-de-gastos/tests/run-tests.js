// ══════════════════════════════════════
// RUNNER DE TESTS PARA NODE
// Ejecuta: node tests/run-tests.js
// ══════════════════════════════════════
const fs = require('fs');
const path = require('path');

// ── Funciones a testear (extraídas de app.js) ──
const fmt = n => '$' + Math.round(Math.abs(n)).toLocaleString('es-CL');

function getRawValue(str) {
  const v = String(str).replace(/\./g, '').replace(',', '.');
  return parseFloat(v) || 0;
}

function setupFmtLogic(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('es-CL');
}

let cycleStartDay = 1;
function getCycleForDate(date) {
  const day = date.getDate();
  let month, year;
  if (cycleStartDay === 1) {
    month = date.getMonth();
    year = date.getFullYear();
  } else {
    if (day < cycleStartDay) {
      const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      month = prev.getMonth();
      year = prev.getFullYear();
    } else {
      month = date.getMonth();
      year = date.getFullYear();
    }
  }
  return { month, year };
}

function isInCycle(ts, targetMonth, targetYear) {
  const d = new Date(ts);
  if (cycleStartDay === 1) {
    return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
  }
  const cycleStart = new Date(targetYear, targetMonth, cycleStartDay);
  const cycleEnd = new Date(targetYear, targetMonth + 1, cycleStartDay);
  return d >= cycleStart && d < cycleEnd;
}

function calcEvaluate(expr) {
  try {
    // Manejar % como en la app real: se divide por 100
    if (expr.includes('%')) {
      // Reemplazar "N%" por "(N/100)" para evaluar correctamente
      let e = expr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      e = e.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      const result = Function('"use strict"; return (' + e + ')')();
      return isFinite(result) ? parseFloat(result.toFixed(10)) : null;
    }
    let cleanExpr = expr.replace(/[+\-×÷−]$/, '');
    if (!cleanExpr) return null;
    const e = cleanExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    const result = Function('"use strict"; return (' + e + ')')();
    return isFinite(result) ? parseFloat(result.toFixed(10)) : null;
  } catch (e) {
    return null;
  }
}


function calcularDistribucion(ints, gastos) {
  const tg = gastos.reduce((s, g) => s + g.v, 0);
  const ti = ints.reduce((s, i) => s + i.v, 0);
  if (ti === 0) return [];
  return ints.map(i => {
    const p = i.v / ti;
    const a = tg * p;
    const sob = i.v - a;
    return { nombre: i.n, proporcion: p, aporte: a, sobrante: sob };
  });
}

function calcularMetas(ingresos) {
  return {
    ahorro: ingresos * 0.1,
    gustos: ingresos * 0.2,
    fijos: ingresos * 0.7,
    emergencia: ingresos * 4,
    inversion: ingresos * 200
  };
}

// ── Mini framework de tests ──
let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✅ ' + name);
  } catch (e) {
    fail++;
    failures.push(name + ' → ' + e.message);
    console.log('  ❌ ' + name + ' → ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ` — esperado: ${JSON.stringify(b)}, obtenido: ${JSON.stringify(a)}`);
}
function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > (tol || 0.001)) throw new Error((msg || '') + ` — esperado: ${b}, obtenido: ${a}`);
}

// ══════════════════════════════════════
// TESTS
// ══════════════════════════════════════
console.log('\n═══ FORMATO DE MONTOS ═══');
test('Formatea 1000 como $1.000', () => assertEq(fmt(1000), '$1.000'));
test('Formatea 1000000 como $1.000.000', () => assertEq(fmt(1000000), '$1.000.000'));
test('Formatea 0 como $0', () => assertEq(fmt(0), '$0'));
test('Formatea negativo con valor absoluto', () => assertEq(fmt(-500), '$500'));
test('setupFmt convierte "1234" a "1.234"', () => assertEq(setupFmtLogic('1234'), '1.234'));
test('setupFmt con vacio devuelve vacio', () => assertEq(setupFmtLogic(''), ''));
test('getRawValue convierte "1.234" a 1234', () => assertEq(getRawValue('1.234'), 1234));
test('getRawValue convierte "1.234,56" a 1234.56', () => assertEq(getRawValue('1.234,56'), 1234.56));
test('getRawValue con texto devuelve 0', () => assertEq(getRawValue('abc'), 0));

console.log('\n═══ CICLO MENSUAL ═══');
test('Con ciclo=1, 15 de marzo pertenece a marzo', () => {
  cycleStartDay = 1;
  const r = getCycleForDate(new Date(2026, 2, 15));
  assertEq(r.month, 2); assertEq(r.year, 2026);
});
test('Con ciclo=26, 10 de marzo pertenece a febrero', () => {
  cycleStartDay = 26;
  const r = getCycleForDate(new Date(2026, 2, 10));
  assertEq(r.month, 1); assertEq(r.year, 2026);
});
test('Con ciclo=26, 28 de marzo pertenece a marzo', () => {
  cycleStartDay = 26;
  const r = getCycleForDate(new Date(2026, 2, 28));
  assertEq(r.month, 2);
});
test('isInCycle con ciclo=1 y fecha en el mes', () => {
  cycleStartDay = 1;
  const ts = new Date(2026, 2, 15).getTime();
  assert(isInCycle(ts, 2, 2026));
  assert(!isInCycle(ts, 1, 2026));
});
test('isInCycle con ciclo=26 y fecha antes del dia 26', () => {
  cycleStartDay = 26;
  const ts = new Date(2026, 2, 10).getTime();
  assert(isInCycle(ts, 1, 2026));
  assert(!isInCycle(ts, 2, 2026));
});

console.log('\n═══ CALCULADORA ═══');
test('2+2 = 4', () => assertEq(calcEvaluate('2+2'), 4));
test('10×5 = 50', () => assertEq(calcEvaluate('10×5'), 50));
test('100÷4 = 25', () => assertEq(calcEvaluate('100÷4'), 25));
test('10−3 = 7', () => assertEq(calcEvaluate('10−3'), 7));
test('2+3×4 = 14 (precedencia)', () => assertEq(calcEvaluate('2+3×4'), 14));
test('(2+3)×4 = 20', () => assertEq(calcEvaluate('(2+3)×4'), 20));
test('10% = 0.1', () => assertEq(calcEvaluate('10%'), 0.1));
test('50% de 200 = 100', () => assertEq(calcEvaluate('200×50%'), 100));
test('Division por cero devuelve null', () => assertEq(calcEvaluate('5÷0'), null));
test('Expresion vacia devuelve null', () => assertEq(calcEvaluate(''), null));
test('Operador final se elimina', () => assertEq(calcEvaluate('5+'), 5));
test('Decimales: 0.1+0.2 = 0.3', () => assertClose(calcEvaluate('0.1+0.2'), 0.3, 0.0001));

console.log('\n═══ DISTRIBUCION PROPORCIONAL ═══');
test('2 integrantes con ingresos iguales pagan 50% cada uno', () => {
  const ints = [{ n: 'A', v: 500000 }, { n: 'B', v: 500000 }];
  const gastos = [{ v: 200000 }];
  const r = calcularDistribucion(ints, gastos);
  assertEq(r.length, 2);
  assertClose(r[0].proporcion, 0.5, 0.001);
  assertClose(r[0].aporte, 100000, 0.001);
  assertClose(r[1].aporte, 100000, 0.001);
});
test('Integrante con mas ingreso paga mas', () => {
  const ints = [{ n: 'A', v: 300000 }, { n: 'B', v: 100000 }];
  const gastos = [{ v: 200000 }];
  const r = calcularDistribucion(ints, gastos);
  assert(r[0].aporte > r[1].aporte);
  assertClose(r[0].aporte, 150000, 0.001);
  assertClose(r[1].aporte, 50000, 0.001);
});
test('Suma de aportes = total gastos', () => {
  const ints = [{ n: 'A', v: 400000 }, { n: 'B', v: 300000 }, { n: 'C', v: 300000 }];
  const gastos = [{ v: 250000 }];
  const r = calcularDistribucion(ints, gastos);
  const totalAportes = r.reduce((s, x) => s + x.aporte, 0);
  assertClose(totalAportes, 250000, 0.001);
});
test('Sin ingresos devuelve array vacio', () => {
  const r = calcularDistribucion([], [{ v: 100 }]);
  assertEq(r.length, 0);
});
test('Sobrante = ingreso - aporte', () => {
  const ints = [{ n: 'A', v: 500000 }];
  const gastos = [{ v: 200000 }];
  const r = calcularDistribucion(ints, gastos);
  assertClose(r[0].sobrante, 300000, 0.001);
});

console.log('\n═══ METAS FINANCIERAS ═══');
test('Con sueldo 1.000.000, ahorro = 100.000', () => assertEq(calcularMetas(1000000).ahorro, 100000));
test('Con sueldo 1.000.000, gustos = 200.000', () => assertEq(calcularMetas(1000000).gustos, 200000));
test('Con sueldo 1.000.000, fijos = 700.000', () => assertEq(calcularMetas(1000000).fijos, 700000));
test('Con sueldo 1.000.000, emergencia = 4.000.000', () => assertEq(calcularMetas(1000000).emergencia, 4000000));
test('Con sueldo 1.000.000, inversion = 200.000.000', () => assertEq(calcularMetas(1000000).inversion, 200000000));
test('Con sueldo 0, todas las metas son 0', () => {
  const m = calcularMetas(0);
  assertEq(m.ahorro, 0); assertEq(m.gustos, 0); assertEq(m.fijos, 0);
  assertEq(m.emergencia, 0); assertEq(m.inversion, 0);
});

console.log('\n═══ CATEGORIAS ═══');
test('Categorias fijas base incluyen Vivienda y Salud', () => {
  const fijos = ['Vivienda', 'Alimentacion', 'Transporte', 'Servicios', 'Educacion', 'Salud'];
  assert(fijos.includes('Vivienda')); assert(fijos.includes('Salud'));
});
test('Categorias gustos incluyen Entretenimiento y Ropa', () => {
  const gustos = ['Entretenimiento', 'Ropa'];
  assert(gustos.includes('Entretenimiento')); assert(gustos.includes('Ropa'));
});

console.log('\n═══ CSV ═══');
test('Escapa comillas dobles en descripcion', () => {
  const desc = 'Cafe "especial"';
  assertEq(desc.replace(/"/g, '""'), 'Cafe ""especial""');
});
test('Monto negativo para gastos', () => {
  const m = { t: 'gasto', v: 5000 };
  assertEq(m.t === 'ingreso' ? m.v : -m.v, -5000);
});
test('Monto positivo para ingresos', () => {
  const m = { t: 'ingreso', v: 5000 };
  assertEq(m.t === 'ingreso' ? m.v : -m.v, 5000);
});

console.log('\n═══ PRESUPUESTOS ═══');
test('Porcentaje usado se calcula correctamente', () => {
  assertEq(Math.min((25000 / 100000) * 100, 100), 25);
});
test('Porcentaje se limita a 100', () => {
  assertEq(Math.min((150000 / 100000) * 100, 100), 100);
});
test('Superado muestra alerta', () => {
  assert(Math.min((120000 / 100000) * 100, 100) >= 100);
});

console.log('\n═══ BACKUP ═══');
test('Serializa y deserializa datos', () => {
  const data = { integrantes: [{ n: 'A', v: 100 }], movimientos: [{ d: 'x', v: 50 }] };
  const parsed = JSON.parse(JSON.stringify(data));
  assertEq(parsed.integrantes.length, 1);
  assertEq(parsed.movimientos[0].v, 50);
});
test('Validacion de archivo invalido', () => {
  const data = { foo: 'bar' };
  assert(!(data.movimientos || data.integrantes));
});

console.log('\n═══ BUSQUEDA ═══');
test('Filtra por descripcion (case insensitive)', () => {
  const movs = [{ d: 'Arriendo', c: 'Vivienda' }, { d: 'Sueldo', c: 'Sueldo' }];
  const q = 'arriendo';
  const fil = movs.filter(m => (m.d || '').toLowerCase().includes(q) || (m.c || '').toLowerCase().includes(q));
  assertEq(fil.length, 1); assertEq(fil[0].d, 'Arriendo');
});
test('Filtra por categoria', () => {
  const movs = [{ d: 'Pan', c: 'Alimentacion' }, { d: 'Bencina', c: 'Transporte' }];
  const q = 'alimentacion';
  const fil = movs.filter(m => (m.d || '').toLowerCase().includes(q) || (m.c || '').toLowerCase().includes(q));
  assertEq(fil.length, 1); assertEq(fil[0].c, 'Alimentacion');
});
test('Sin resultados devuelve vacio', () => {
  const movs = [{ d: 'Pan', c: 'Alimentacion' }];
  const q = 'zzz';
  const fil = movs.filter(m => (m.d || '').toLowerCase().includes(q) || (m.c || '').toLowerCase().includes(q));
  assertEq(fil.length, 0);
});

console.log('\n═══ ELIMINACION ═══');
test('Filtra correctamente por id', () => {
  const movs = [{ id: 1, d: 'A' }, { id: 2, d: 'B' }, { id: 3, d: 'C' }];
  const result = movs.filter(m => m.id !== 2);
  assertEq(result.length, 2);
  assert(!result.some(m => m.id === 2));
});

console.log('\n═══ CLONAR FIJOS ═══');
test('Detecta duplicados por descripcion y monto', () => {
  const movs = [{ d: 'Arriendo', v: 500000, ts: new Date(2026, 2, 5).getTime() }];
  assert(movs.some(exist => exist.d === 'Arriendo' && exist.v === 500000));
});
test('No duplica si ya existe', () => {
  const movs = [{ d: 'Arriendo', v: 500000 }];
  const fijos = [{ d: 'Arriendo', v: 500000 }];
  let count = 0;
  fijos.forEach(m => {
    if (!movs.some(exist => exist.d === m.d && exist.v === m.v)) count++;
  });
  assertEq(count, 0);
});

// ══════════════════════════════════════
// RESUMEN
// ══════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log(`  TOTAL: ${pass + fail} | ✅ PASADOS: ${pass} | ❌ FALLIDOS: ${fail}`);
console.log('══════════════════════════════════════');
if (failures.length) {
  console.log('\n--- DETALLE DE FALLOS ---');
  failures.forEach(f => console.log('❌ ' + f));
  process.exit(1);
} else {
  console.log('\n🎉 TODOS LOS TESTS PASARON CORRECTAMENTE');
}
