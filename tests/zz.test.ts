//test.js
import defaultExport, { bar, foo } from '../src/zz'

jest.mock('../src/zz', () => {
  const originalModule = jest.requireActual('../src/zz')

  //Mock the default export and named export 'foo'
  return {
    __esModule: true,
    ...originalModule,
    default: jest.fn(() => 'mocked baz'),
    foo: 'mocked foo'
  }
})

test('should do a partial mock', () => {
  const defaultExportResult = defaultExport()
  expect(defaultExportResult).toBe('mocked baz')
  expect(defaultExport).toHaveBeenCalled()

  expect(foo).toBe('mocked foo')
  expect(bar()).toBe('bar')
})
