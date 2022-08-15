import { expectType } from 'tsd'
import { ExecException, ChildProcess } from 'child_process'
import fastFolderSize from '.'
import fastFolderSizeSync from '../sync'

expectType<ChildProcess>(
  fastFolderSize('.', (err, bytes) => {
    expectType<ExecException | null>(err)
    expectType<number | undefined>(bytes)
  })
)

expectType<number | undefined>(fastFolderSizeSync('.'))
