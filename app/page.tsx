export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg shadow-xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          🌳 Slack Decision Tree
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Build decision tree workflows in Slack and run them anywhere.
        </p>

        <div className="space-y-4 mb-8">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white">
                ✓
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Home Tab Management</h3>
              <p className="text-gray-600">Set up decision trees from the Slack home tab</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white">
                ✓
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Interactive Workflows</h3>
              <p className="text-gray-600">Guide users through decisions with questions and answers</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white">
                ✓
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Run Anywhere</h3>
              <p className="text-gray-600">Trigger decision trees from Slack workflows</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Getting Started</h3>
          <p className="text-gray-600 mb-4">
            This app is designed for single-workspace deployment. Configure your Slack app credentials in the environment variables and deploy to Vercel.
          </p>
          <a
            href="https://github.com/yourusername/slack-decisiontree"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Documentation
          </a>
        </div>
      </div>
    </main>
  );
}
