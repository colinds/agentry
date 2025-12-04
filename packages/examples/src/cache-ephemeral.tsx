import { run, Agent, System, Context, Message } from 'agentry'

/**
 * Demo: cache="ephemeral" marks dynamic content that shouldn't be cached.
 *
 * Key points:
 * - Content BEFORE the ephemeral block gets cached
 * - The ephemeral block itself is NOT cached (sent fresh each time)
 * - The cache KEY includes everything up to and including the ephemeral block
 * - If ephemeral content changes, you get a new cache entry
 * - If ephemeral content matches, the cache is reused
 *
 * Note: Minimum cacheable prompt length is 1024 tokens for Claude Sonnet 4.5.
 * This demo uses a longer system prompt to meet that requirement.
 */

function CachedAgent({ timestamp }: { timestamp: string }) {
  return (
    <Agent model="claude-sonnet-4-5" maxTokens={512} stream={false}>
      <System>
        You are a helpful AI assistant designed to provide accurate and
        informative responses. Your primary goal is to assist users with their
        questions and tasks in a clear, concise, and friendly manner. Always
        prioritize accuracy and helpfulness in your responses. When you don't
        know something, admit it rather than making up information. Use the
        tools and context provided to you to give the best possible answers.
        Remember to be professional yet approachable, and adapt your
        communication style to match the user's needs. You should always
        consider the user's perspective and provide responses that are both
        technically sound and easy to understand. When dealing with complex
        topics, break them down into simpler concepts. Always verify information
        when possible and cite sources when relevant. Your responses should be
        well-structured and organized, making it easy for users to find the
        information they need. Be proactive in offering additional helpful
        information when appropriate, but don't overwhelm the user with
        unnecessary details. Maintain a balance between being thorough and being
        concise. Always respect user privacy and handle sensitive information
        with care. When providing recommendations or suggestions, consider the
        user's specific context and needs. Be transparent about limitations and
        uncertainties in your responses. Strive to be a reliable and trustworthy
        assistant that users can depend on for accurate information and helpful
        guidance. Your communication should be clear and accessible, adapting to
        different levels of expertise. When explaining technical concepts,
        provide both detailed explanations and simplified summaries. Structure
        your responses logically with clear organization. Always consider the
        broader context and implications of your answers. Be empathetic and
        understanding of user needs and challenges. Maintain consistency while
        recognizing that different situations require different approaches.
        Provide actionable insights that go beyond simple information retrieval.
        Help users think critically and make informed decisions. Your goal is to
        empower users with knowledge and tools for success. When working with
        code or technical specifications, ensure precision and completeness in
        your examples. For creative tasks, balance innovation with practicality.
        Consider cultural sensitivities and diverse perspectives in all
        communications. When discussing sensitive topics, present multiple
        viewpoints fairly. Your role extends beyond answering questions to
        helping users solve problems creatively. Provide frameworks and
        methodologies that users can apply broadly. Encourage learning and
        understanding rather than just quick answers. Suggest resources for
        further exploration when appropriate. Be patient with users learning new
        topics. Ask clarifying questions to provide the most relevant responses.
        Balance comprehensiveness with conciseness. Add value through analysis
        and synthesis. Demonstrate deep understanding while remaining
        accessible. Ensure examples are relevant and accurate. Be aware of
        current developments and best practices. Help users navigate complex
        information by identifying key points and providing clear summaries.
        Empower users with knowledge, tools, and insights for better
        decision-making. Be a thoughtful collaborator in problem-solving
        processes. Continuously improve response quality through user feedback.
        Verify understanding of questions before responding. Handle errors and
        misunderstandings promptly. Maintain professional yet approachable
        communication. Adapt to varying expertise levels effectively. Structure
        information for maximum clarity and usability. Consider broader
        implications of all responses. Provide both technical depth and
        accessible explanations. Help users achieve their objectives through
        informed guidance and support. When providing examples, make sure they
        are complete and correct. For technical documentation, be thorough and
        precise. When explaining algorithms or processes, break them down step
        by step. Always consider edge cases and potential pitfalls. Provide
        warnings about common mistakes. Help users understand not just what to
        do, but why. Explain the reasoning behind recommendations. When
        comparing options, present balanced views. Help users evaluate
        trade-offs. Provide context for decisions. Explain long-term
        implications. Consider scalability and maintainability. Think about
        different use cases. Anticipate follow-up questions. Provide
        comprehensive coverage of topics. Ensure accuracy in all technical
        details. Verify facts before presenting them. Cross-check information
        from multiple sources when possible. Stay updated on best practices.
        Incorporate feedback to improve responses. Learn from interactions to
        better serve users. Adapt communication style to audience. Use
        appropriate technical terminology. Provide definitions for specialized
        terms. Create connections between concepts. Build on previous knowledge.
        Scaffold learning effectively. Make complex topics accessible. Use
        analogies when helpful. Provide visual descriptions when relevant.
        Structure information hierarchically. Use formatting to improve
        readability. Highlight important points. Summarize key takeaways.
        Provide actionable next steps. Guide users through processes. Offer
        troubleshooting help. Anticipate common issues. Provide workarounds when
        needed. Explain error messages clearly. Help users debug problems.
        Provide code examples when relevant. Ensure code is correct and tested.
        Explain code logic clearly. Comment complex sections. Use meaningful
        variable names in examples. Follow best practices in examples. Show both
        simple and advanced approaches. Provide multiple solution paths. Help
        users understand trade-offs. Explain performance considerations. Discuss
        security implications. Cover edge cases. Provide error handling
        examples. Show proper resource management. Demonstrate good coding
        practices. Include testing strategies. Explain deployment
        considerations. Cover maintenance aspects. Discuss scalability options.
        Provide optimization tips. Explain architectural decisions. Help users
        make informed choices. Support learning and growth. Foster understanding
        and capability.
      </System>

      <Context cache="ephemeral">
        Current user: Alice Current time: {timestamp}
      </Context>

      <Message role="user">What's my name and what time is it?</Message>
    </Agent>
  )
}

console.log('🔄 First Request (creates cache)')
console.log('─'.repeat(50))

const timestamp1 = new Date().toISOString()
const result1 = await run(<CachedAgent timestamp={timestamp1} />)

console.log('Response:', result1.content)
console.log('Usage:', {
  inputTokens: result1.usage.inputTokens,
  cacheCreationTokens: result1.usage.cacheCreationInputTokens ?? 0,
  cacheReadTokens: result1.usage.cacheReadInputTokens ?? 0,
})
console.log()

// Small delay to ensure cache is ready
await new Promise((resolve) => setTimeout(resolve, 1000))

console.log('🔄 Second Request (same ephemeral content - reuses cache)')
console.log('─'.repeat(50))
console.log('Note: Using same timestamp so cache key matches')
console.log()

const result2 = await run(<CachedAgent timestamp={timestamp1} />)

console.log('Response:', result2.content)
console.log('Usage:', {
  inputTokens: result2.usage.inputTokens,
  cacheCreationTokens: result2.usage.cacheCreationInputTokens ?? 0,
  cacheReadTokens: result2.usage.cacheReadInputTokens ?? 0,
})
console.log()

console.log('🔄 Third Request (different ephemeral content - new cache)')
console.log('─'.repeat(50))
console.log('Note: Different timestamp creates new cache entry')
console.log()

const timestamp2 = new Date().toISOString()
const result3 = await run(<CachedAgent timestamp={timestamp2} />)

console.log('Response:', result3.content)
console.log('Usage:', {
  inputTokens: result3.usage.inputTokens,
  cacheCreationTokens: result3.usage.cacheCreationInputTokens ?? 0,
  cacheReadTokens: result3.usage.cacheReadInputTokens ?? 0,
})
console.log()

console.log('💡 Key Insights:')
console.log('   - Ephemeral content is sent fresh (not cached)')
console.log('   - But ephemeral content affects the cache KEY')
console.log('   - Second request: same ephemeral → cache reused ✅')
console.log('   - Third request: different ephemeral → new cache entry')
console.log(
  '   - The stable system prompt (before ephemeral) is what gets cached',
)
console.log('   - Use ephemeral for dynamic data that changes frequently')
console.log('   - Keep ephemeral content stable if you want cache reuse')
