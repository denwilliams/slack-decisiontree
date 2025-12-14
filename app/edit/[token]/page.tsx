'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Node {
  id: string;
  treeId: string;
  nodeType: 'decision' | 'answer';
  title: string;
  content: string | null;
  orderIndex: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Option {
  id: string;
  nodeId: string;
  label: string;
  nextNodeId: string | null;
  orderIndex: string;
  createdAt: Date;
}

interface Tree {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TreeData {
  tree: Tree;
  nodes: Node[];
  options: Option[];
  expiresAt: Date;
}

export default function EditPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [editingTree, setEditingTree] = useState(false);
  const [treeName, setTreeName] = useState('');
  const [treeDescription, setTreeDescription] = useState('');

  // Node editing state
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [nodeTitle, setNodeTitle] = useState('');
  const [nodeContent, setNodeContent] = useState('');
  const [nodeType, setNodeType] = useState<'decision' | 'answer'>('decision');

  // Option editing state
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionNextNode, setNewOptionNextNode] = useState('');

  useEffect(() => {
    fetchData();
  }, [token]);

  async function fetchData() {
    try {
      const response = await fetch(`/api/editor/${token}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load tree data');
      }
      const treeData = await response.json();
      setData(treeData);
      setTreeName(treeData.tree.name);
      setTreeDescription(treeData.tree.description || '');
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  }

  async function saveTreeInfo() {
    try {
      const response = await fetch(`/api/editor/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: treeName,
          description: treeDescription,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save tree info');
      }

      setEditingTree(false);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  async function createNode() {
    try {
      const response = await fetch(`/api/editor/${token}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeType: 'decision',
          title: 'New Node',
          content: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create node');
      }

      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create node');
    }
  }

  async function saveNode() {
    if (!editingNode) return;

    try {
      const response = await fetch(`/api/editor/${token}/nodes/${editingNode.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeType,
          title: nodeTitle,
          content: nodeContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save node');
      }

      setEditingNode(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save node');
    }
  }

  async function deleteNode(nodeId: string) {
    if (!confirm('Are you sure you want to delete this node?')) return;

    try {
      const response = await fetch(`/api/editor/${token}/nodes/${nodeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete node');
      }

      setSelectedNode(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete node');
    }
  }

  async function createOption() {
    if (!selectedNode || !newOptionLabel.trim()) return;

    try {
      const response = await fetch(`/api/editor/${token}/nodes/${selectedNode.id}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newOptionLabel,
          nextNodeId: newOptionNextNode || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create option');
      }

      setNewOptionLabel('');
      setNewOptionNextNode('');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create option');
    }
  }

  async function deleteOption(optionId: string) {
    if (!confirm('Are you sure you want to delete this option?')) return;

    try {
      const response = await fetch(`/api/editor/${token}/options/${optionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete option');
      }

      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete option');
    }
  }

  function startEditNode(node: Node) {
    setEditingNode(node);
    setNodeTitle(node.title);
    setNodeContent(node.content || '');
    setNodeType(node.nodeType);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading decision tree...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-700">{error || 'Failed to load tree data'}</p>
          <p className="text-sm text-gray-500 mt-4">
            This link may have expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  const getNodeOptions = (nodeId: string) => {
    return data.options.filter((opt) => opt.nodeId === nodeId);
  };

  const getNodeById = (nodeId: string | null) => {
    if (!nodeId) return null;
    return data.nodes.find((node) => node.id === nodeId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {editingTree ? (
            <div>
              <input
                type="text"
                value={treeName}
                onChange={(e) => setTreeName(e.target.value)}
                className="text-3xl font-bold mb-2 w-full border-b-2 border-blue-500 focus:outline-none"
              />
              <textarea
                value={treeDescription}
                onChange={(e) => setTreeDescription(e.target.value)}
                className="text-gray-600 w-full border rounded p-2 mt-2"
                placeholder="Description"
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveTreeInfo}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingTree(false);
                    setTreeName(data.tree.name);
                    setTreeDescription(data.tree.description || '');
                  }}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{data.tree.name}</h1>
                  <p className="text-gray-600 mt-2">{data.tree.description || 'No description'}</p>
                </div>
                <button
                  onClick={() => setEditingTree(true)}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
                >
                  Edit Info
                </button>
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Token expires: {new Date(data.expiresAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Nodes List */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Nodes</h2>
              <button
                onClick={createNode}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                + Add Node
              </button>
            </div>

            <div className="space-y-3">
              {data.nodes.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No nodes yet. Add your first node!</p>
              ) : (
                data.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`border rounded-lg p-4 cursor-pointer transition ${
                      selectedNode?.id === node.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedNode(node)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">
                            {node.nodeType === 'decision' ? '❓' : '✅'}
                          </span>
                          <h3 className="font-semibold">{node.title}</h3>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {node.nodeType === 'decision' ? 'Decision' : 'Answer'} node
                        </p>
                        {node.content && (
                          <p className="text-sm text-gray-600 mt-2">{node.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Node Details / Editor */}
          <div className="bg-white rounded-lg shadow-md p-6">
            {editingNode ? (
              <div>
                <h2 className="text-xl font-bold mb-4">Edit Node</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Node Type</label>
                    <select
                      value={nodeType}
                      onChange={(e) => setNodeType(e.target.value as 'decision' | 'answer')}
                      className="w-full border rounded p-2"
                    >
                      <option value="decision">❓ Decision (with options)</option>
                      <option value="answer">✅ Answer (final result)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      type="text"
                      value={nodeTitle}
                      onChange={(e) => setNodeTitle(e.target.value)}
                      className="w-full border rounded p-2"
                      placeholder="Enter node title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Content</label>
                    <textarea
                      value={nodeContent}
                      onChange={(e) => setNodeContent(e.target.value)}
                      className="w-full border rounded p-2 h-24"
                      placeholder="Enter additional details"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveNode}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingNode(null)}
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedNode ? (
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold">Node Details</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditNode(selectedNode)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteNode(selectedNode.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-3xl">
                      {selectedNode.nodeType === 'decision' ? '❓' : '✅'}
                    </span>
                    <h3 className="text-lg font-semibold">{selectedNode.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">
                    {selectedNode.nodeType === 'decision' ? 'Decision' : 'Answer'} node
                  </p>
                  {selectedNode.content && (
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{selectedNode.content}</p>
                  )}
                </div>

                {selectedNode.nodeType === 'decision' && (
                  <div>
                    <h3 className="font-semibold mb-3">Options</h3>
                    <div className="space-y-2 mb-4">
                      {getNodeOptions(selectedNode.id).map((option) => {
                        const nextNode = getNodeById(option.nextNodeId);
                        return (
                          <div
                            key={option.id}
                            className="flex justify-between items-center border rounded p-3"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{option.label}</p>
                              <p className="text-sm text-gray-500">
                                → {nextNode ? nextNode.title : 'Not set'}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteOption(option.id)}
                              className="text-red-600 hover:text-red-700 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Add Option</h4>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newOptionLabel}
                          onChange={(e) => setNewOptionLabel(e.target.value)}
                          className="w-full border rounded p-2"
                          placeholder="Option label (e.g., 'Yes', 'No')"
                        />
                        <select
                          value={newOptionNextNode}
                          onChange={(e) => setNewOptionNextNode(e.target.value)}
                          className="w-full border rounded p-2"
                        >
                          <option value="">Select next node (optional)</option>
                          {data.nodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.nodeType === 'decision' ? '❓' : '✅'} {node.title}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={createOption}
                          className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                        >
                          Add Option
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">No node selected</p>
                <p className="text-sm">Click on a node to view and edit its details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
