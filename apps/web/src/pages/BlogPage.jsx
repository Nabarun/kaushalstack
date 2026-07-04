import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Calendar, Tag, ArrowRight } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/blog?perPage=20')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => setPosts(data.items || []))
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Helmet>
        <title>Blog · KaushalStack</title>
        <meta name="description" content="Engineering notes and build-in-public posts from KaushalStack." />
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Blog</h1>
          <p className="text-muted-foreground text-lg">Engineering notes &amp; build-in-public updates from KaushalStack.</p>
        </div>

        {loading && (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border bg-card p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-3/4 mb-3" />
                <div className="h-4 bg-muted rounded w-full mb-2" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-destructive text-sm p-4 border border-destructive/30 rounded-lg">
            Failed to load posts: {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="text-muted-foreground text-center py-20">No posts yet — check back soon.</p>
        )}

        <div className="space-y-8">
          {posts.map(post => (
            <article key={post.id} className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
              <Link to={`/blog/${post.slug}`}>
                <h2 className="text-2xl font-semibold mb-2 hover:text-primary transition-colors">
                  {post.title}
                </h2>
              </Link>

              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                {post.published_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(post.published_at)}
                  </span>
                )}
                {post.tags && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    {post.tags}
                  </span>
                )}
              </div>

              {post.excerpt && (
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">{post.excerpt}</p>
              )}

              <Link
                to={`/blog/${post.slug}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Read more <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
