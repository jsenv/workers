import { assert } from "@jsenv/assert"

import {
  optimizeValueForPostMessage,
  recomposeValueFromPostMessage,
} from "@jsenv/workers"

// undefined
{
  const valueBeforeOptim = undefined
  const [value] = optimizeValueForPostMessage(valueBeforeOptim)

  const actual = recomposeValueFromPostMessage(value)
  const expected = undefined
  assert({ actual, expected })
}

// null
{
  const valueBeforeOptim = null
  const [value] = optimizeValueForPostMessage(valueBeforeOptim)

  const actual = recomposeValueFromPostMessage(value)
  const expected = null
  assert({ actual, expected })
}

// object
{
  const valueBeforeOptim = { answer: 42 }
  const [value] = optimizeValueForPostMessage(valueBeforeOptim)

  const actual = recomposeValueFromPostMessage(value)
  const expected = { answer: 42 }
  assert({ actual, expected })
}

// object with buffer
{
  const valueBeforeOptim = { buffer: Buffer.from("hello") }
  const [value] = optimizeValueForPostMessage(valueBeforeOptim)

  const actual = recomposeValueFromPostMessage(value)
  const expected = { buffer: Buffer.from("hello") }
  assert({ actual, expected })
}
