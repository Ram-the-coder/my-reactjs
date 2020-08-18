import MyReact from './MyReact';


/**@jsx MyReact.createElement */

function Counter() {
	const [state, setState] = MyReact.useState(1);
	return (
		<h1 onClick={() => setState(count => count + 1)}>
			Count: {state}
		</h1>
	)
}

let element = <Counter />
MyReact.render(element, document.getElementById('root'));