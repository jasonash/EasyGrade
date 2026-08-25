/**
 * Seed the calibration fixture tests into a local EasyGrade database and
 * write tests/fixtures/real-manifest.json with the resulting codes.
 *
 * Close the app first. Run with:
 *   npm run seed:fixtures            (default dev database)
 *   npm run seed:fixtures -- <path>  (another database file)
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { openDatabase } from '../src/main/db/database'
import { SectionRepository } from '../src/main/db/repositories/section.repo'
import { StudentRepository } from '../src/main/db/repositories/student.repo'
import { TestRepository } from '../src/main/db/repositories/test.repo'
import { SectionService } from '../src/main/services/section.service'
import { StudentService } from '../src/main/services/student.service'
import { TestService } from '../src/main/services/test.service'
import {
  CLEAN_TEST,
  EDGE_TEST,
  FILES,
  FIXTURE_SECTION,
  FIXTURE_STUDENTS,
  FIXTURE_TESTS,
  SHEETS,
  fixtureChoices,
  type FixtureTest
} from '../tests/fixtures/calibration'

function defaultDbPath(): string {
  const home = homedir()
  if (process.platform === 'darwin') return join(home, 'Library/Application Support/easygrade/easygrade.db')
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? join(home, 'AppData/Roaming'), 'easygrade/easygrade.db')
  return join(process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'), 'easygrade/easygrade.db')
}

const dbPath = resolve(process.argv[2] ?? defaultDbPath())
const db = openDatabase({ path: dbPath })
const sectionRepo = new SectionRepository(db)
const sections = new SectionService(sectionRepo)
const students = new StudentService(new StudentRepository(db), sectionRepo)
const tests = new TestService(new TestRepository(db), sectionRepo)

const section =
  sections.list(true).find((s) => s.name === FIXTURE_SECTION.name) ?? sections.create(FIXTURE_SECTION)
console.log(`Section "${section.name}" (id ${section.id})`)

const roster = students.listBySection(section.id, true)
const studentCodes: Record<string, string> = {}
for (const fixture of FIXTURE_STUDENTS) {
  const existing = roster.find((s) => s.studentNumber === fixture.studentNumber)
  const student =
    existing ??
    students.create({ sectionId: section.id, lastName: fixture.lastName, firstName: fixture.firstName, studentNumber: fixture.studentNumber })
  studentCodes[fixture.slug] = student.code
  console.log(`  ${student.lastName}, ${student.firstName}  #${student.studentNumber}  code ${student.code}${existing ? ' (existing)' : ''}`)
}

const testCodes: Record<string, { code: string; layoutVersion: number; id: number }> = {}
for (const fixture of FIXTURE_TESTS) {
  const test = seedTest(fixture)
  testCodes[fixture.slug] = { code: test.code, layoutVersion: test.layoutVersion, id: test.id }
  console.log(`  "${test.title}"  code ${test.code}  layout v${test.layoutVersion}  ${test.status}`)
}

function seedTest(fixture: FixtureTest): ReturnType<TestService['get']> {
  const existing = tests.list(section.id).find((t) => t.title === fixture.title)
  let id = existing?.id
  if (id !== undefined && existing?.status === 'finalized') return tests.get(id)
  if (id === undefined) id = tests.create({ sectionId: section.id, title: fixture.title }).id
  tests.update({
    id,
    title: fixture.title,
    instructions: fixture.instructions,
    questions: fixture.questions.map((q) => ({
      stem: q.stem,
      choices: fixtureChoices(q.choiceCount),
      correctChoice: q.key
    }))
  })
  return tests.finalize(id)
}

const manifest = {
  generatedAt: new Date().toISOString(),
  database: dbPath,
  section: { id: section.id, name: section.name },
  students: studentCodes,
  tests: Object.fromEntries(
    [CLEAN_TEST, EDGE_TEST].map((t) => [
      t.slug,
      {
        ...testCodes[t.slug],
        title: t.title,
        rows: t.questions.map((q, i) => ({ q: i + 1, choiceCount: q.choiceCount, key: 'ABCDE'[q.key], ...q.expect }))
      }
    ])
  ),
  sheets: SHEETS.map((s) => ({
    ...s,
    testCode: s.test ? testCodes[s.test]?.code ?? null : null,
    studentCode: s.student ? studentCodes[s.student] ?? null : null
  })),
  files: FILES
}
const manifestPath = resolve('tests/fixtures/real-manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Manifest written to ${manifestPath}`)
db.close()
