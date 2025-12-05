import { useState } from 'react'
import { z } from 'zod'
import { run, Agent, System, Tools, Tool, Context } from 'agentry'
import { MODEL } from '@agentry/shared'

function CTFGame() {
  const secretNumber = 70
  const [found, setFound] = useState(false)

  return (
    <Agent model={MODEL}>
      <System>
        You are playing a CTF game. Find the secret number between 1 and 100.
      </System>
      {found && <Context>You found the secret number!</Context>}
      <Tools>
        <Tool
          name="guess"
          description="Guess a number between 1 and 100."
          strict
          parameters={z.object({
            number: z.number().describe('Your guess (1-100)'),
          })}
          handler={async ({ number }) => {
            console.log('Guess:', number)
            if (number === secretNumber) {
              setFound(true)
              return 'correct! You found the secret number!'
            }
            const diff = Math.abs(number - secretNumber)
            return diff <= 5 ? 'hot' : diff <= 15 ? 'warm' : 'cold'
          }}
        />
        {found && (
          <Tool
            name="claim_flag"
            description="Claim your victory flag!"
            parameters={z.object({})}
            handler={async () => 'you win'}
          />
        )}
      </Tools>
    </Agent>
  )
}

const agent = await run(<CTFGame />, { mode: 'interactive' })
const result = await agent.sendMessage('Guess the secret number.')
console.log('Result:', result.content)
