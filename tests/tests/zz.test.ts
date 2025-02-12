import { jest } from '@jest/globals'

import * as zz from '../../src/zz'

jest.unstable_mockModule('../src/zz', () => zz)

const { add, subtract } = await import('../../src/zz')

describe('Utils module', () => {
  it('should mock add function', () => {
    const addMock = add as jest.Mock
    addMock.mockReturnValue(5)

    const result = add(2, 3)
    expect(result).toBe(5)
    expect(addMock).toHaveBeenCalledWith(2, 3)
  })

  it('should mock subtract function', () => {
    const subtractMock = subtract as jest.Mock
    subtractMock.mockReturnValue(1)

    const result = subtract(3, 2)
    expect(result).toBe(1)
    expect(subtractMock).toHaveBeenCalledWith(3, 2)
  })
})
